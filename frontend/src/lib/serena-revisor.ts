import "server-only";

// Revisor da Serena: para cada empresa com a conferência do Simples em
// "Revisar", a IA investiga os dados da empresa com ferramentas de CONSULTA
// (cadastro, notas do mês, folha, declarações, prefeitura), usando as regras
// do Simples (skill do Wellington) e o manual do SOMA Gestão, e devolve:
// decisão (APROVAR/ESCALAR), diagnóstico (problema + causa) e ações com a
// tela onde corrigir. Bloqueio nunca é decidido aqui; códigos de risco
// sempre escalam (trava no código, não só no prompt).

import { generateText, Output, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_PADRAO } from "@/lib/pedido-nota/extrair-core";
import { buscarExtrasConferencia, calcularSimplesEmpresa, carregarDadosSimplesLote, COLUNAS_EMPRESA_SIMPLES, type EmpresaSimples } from "@/lib/simples-linha";
import { somarMeses } from "@/lib/tarefas-comum";
import { CONHECIMENTO_SIMPLES, MANUAL_SOMA } from "@/lib/serena-conhecimento";

type Db = SupabaseClient;

const Resposta = z.object({
  decisao: z.enum(["APROVAR", "ESCALAR"]),
  justificativa: z.string().describe("Uma ou duas frases: por que cada motivo está (ou não) explicado pelos dados."),
  diagnostico: z.string().describe("O problema encontrado e a causa provável, com números (ex.: 'Nota 1234 de R$ 5.000 cancelada no ADN mas somada'). Se está tudo certo, diga isso."),
  acoes: z
    .array(z.object({ acao: z.string().describe("O que fazer, no imperativo."), onde: z.string().describe("Caminho da tela no SOMA Gestão (ex.: '/admin/empresas/{id}/fator-r').") }))
    .describe("Correções sugeridas (vazio se APROVAR sem pendência)."),
  pergunta: z.string().nullable().describe("Se ESCALAR: a pergunta exata para a equipe. Se APROVAR: null."),
});

const INSTRUCOES = `Você é a Serena, analista fiscal da SOMA Contabilidade (Petrópolis), responsável pela apuração mensal do Simples Nacional de empresas prestadoras de serviço (maioria da saúde). O sistema já calculou o Simples; a conferência automática marcou a empresa como "Revisar" pelos MOTIVOS. Investigue com as ferramentas (consulte o que for preciso, sem repetir consultas) e decida.

Regras de decisão:
- APROVE apenas quando CADA motivo estiver claramente explicado pelos dados consultados.
- ESCALE sempre que houver risco de anexo/Fator R errado, folha faltando, diferença com a prefeitura sem explicação, sublimite, retenção zerando o DAS, Anexo V, mudança de anexo, dado faltando ou qualquer dúvida.
- Sempre preencha o diagnóstico e as ações com a tela exata do manual (troque {id} pelo id da empresa). Seja específica: cite notas, meses e valores.
- Nunca invente dados; não use conhecimento externo sobre a empresa. Responda em português.

${CONHECIMENTO_SIMPLES}

${MANUAL_SOMA}`;

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const CODIGOS_RISCO = ["FATOR_R_BORDA", "FOLHA_AUSENTE", "FOLHA_INCOMPLETA", "PREFEITURA_DIVERGENTE", "SUBLIMITE", "SUBLIMITE_PERTO", "TETO_SIMPLES", "RETENCAO_ZEROU_DAS", "ANEXO_V"];

/** Ferramentas de consulta, presas à empresa revisada (a IA não escolhe outra empresa). */
function ferramentas(db: Db, companyId: string) {
  return {
    cadastroEmpresa: tool({
      description: "Cadastro da empresa: regime, sujeita ao Fator R, data de abertura, município, CMC, ISS, certificado digital e grupo do WhatsApp.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: c }, { data: cert }, { data: grupos }] = await Promise.all([
          db
            .from("companies")
            .select("legal_name, trade_name, tax_regime, sujeito_fator_r, data_abertura, municipality_name, petropolis_cmc, iss_tipo, ativa, cnae")
            .eq("id", companyId)
            .maybeSingle(),
          db.from("certificates").select("expires_at").eq("company_id", companyId).maybeSingle(),
          db.from("pedido_nota_vinculos").select("grupo_nome").eq("company_id", companyId),
        ]);
        return {
          ...c,
          petropolis_cmc: c?.petropolis_cmc ? "cadastrado" : "não cadastrado",
          certificado: cert ? (new Date(cert.expires_at as string) > new Date() ? `válido até ${String(cert.expires_at).slice(0, 10)}` : "VENCIDO") : "não cadastrado",
          grupos_whatsapp: (grupos ?? []).map((g) => g.grupo_nome),
        };
      },
    }),
    notasDoMes: tool({
      description: "Notas emitidas pela empresa numa competência (base nacional/ADN), incluindo canceladas, ISS retido e retenções federais.",
      inputSchema: z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/) }),
      execute: async ({ competencia }) => {
        const inicio = `${competencia}-01`;
        const fim = `${somarMeses(competencia, 1)}-01`;
        const { data } = await db
          .from("notas_distribuidas")
          .select("numero, data_emissao, competencia, bate_competencia, cancelada, valor_servico, valor_issqn, tipo_retencao_issqn, valor_ret_irrf, valor_pis, valor_cofins, tomador_nome, direcao")
          .eq("company_id", companyId)
          .eq("direcao", "saida")
          .gte("competencia", inicio)
          .lt("competencia", fim)
          .order("data_emissao")
          .limit(80);
        return {
          quantidade: data?.length ?? 0,
          notas: (data ?? []).map((n) => ({
            ...n,
            iss_retido: n.tipo_retencao_issqn === 2 || n.tipo_retencao_issqn === 3,
          })),
        };
      },
    }),
    folhaDozeMeses: tool({
      description: "Folha (salários), pró-labore e FGTS informados por mês nos últimos 13 meses — base do Fator R.",
      inputSchema: z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/) }),
      execute: async ({ competencia }) => {
        const meses = Array.from({ length: 13 }, (_, i) => somarMeses(competencia, -i));
        const { data } = await db.from("folha_mensal").select("*").eq("company_id", companyId).in("competencia", meses);
        return { meses_informados: data?.length ?? 0, folha: data ?? [] };
      },
    }),
    declaracoesAnteriores: tool({
      description: "Últimas declarações do PGDAS-D transmitidas pelo sistema (competência, valor do DAS, data).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await db
          .from("integra_contador_pgdas_declaracoes")
          .select("competencia, valor_total, data_hora_transmissao")
          .eq("company_id", companyId)
          .order("competencia", { ascending: false })
          .limit(8);
        return { declaracoes: data ?? [] };
      },
    }),
    conferenciaPrefeitura: tool({
      description: "Faturamento informado pela Prefeitura de Petrópolis nas conferências feitas (por competência).",
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await db
          .from("conferencia_prefeitura")
          .select("competencia, valor_prefeitura, erro, consultado_em")
          .eq("company_id", companyId)
          .order("competencia", { ascending: false })
          .limit(6);
        return { conferencias: data ?? [] };
      },
    }),
  };
}

export type ResultadoRevisao = { companyId: string; decisao: "APROVAR" | "ESCALAR"; justificativa: string; pergunta: string | null; custoUsd: number | null };

export async function revisarComIa(db: Db, competencia: string, companyIds: string[]): Promise<ResultadoRevisao[]> {
  if (!companyIds.length) return [];
  const [{ data: empresas }, extras, dados] = await Promise.all([
    db.from("companies").select(COLUNAS_EMPRESA_SIMPLES + ", municipality_name").in("id", companyIds),
    buscarExtrasConferencia(db, competencia, companyIds),
    carregarDadosSimplesLote(db, companyIds),
  ]);
  const modelo = process.env.SERENA_MODELO || MODELO_PADRAO;
  const precos: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };
  const anterior = somarMeses(competencia, -1);
  const resultados: ResultadoRevisao[] = [];

  for (const e of (empresas ?? []) as unknown as (EmpresaSimples & { municipality_name: string | null })[]) {
    const d = dados.get(e.id);
    const calc = await calcularSimplesEmpresa(db, e, competencia, { prefeitura: extras.prefeitura.get(e.id) ?? null, aprovacao: extras.aprovacoes.get(e.id) ?? null }, d);
    if (calc.conferencia.status !== "REVISAR" || calc.liberado) continue;
    const calcAnt = await calcularSimplesEmpresa(db, e, anterior, { prefeitura: null, aprovacao: null }, d).catch(() => null);

    const receitaPor = new Map<string, number>();
    for (const n of d?.notasMensais ?? []) if (!n.cancelada) receitaPor.set(n.competencia, (receitaPor.get(n.competencia) ?? 0) + n.valor);
    const historico = Array.from({ length: 12 }, (_, i) => somarMeses(competencia, -i))
      .map((m) => `${m}: ${brl(receitaPor.get(m) ?? 0)}`)
      .join(" | ");

    const resumo = [
      `EMPRESA id=${e.id}: ${e.trade_name || e.legal_name} | município ${e.municipality_name ?? "?"} | abertura ${e.data_abertura ?? "?"} | sujeita ao Fator R: ${e.sujeito_fator_r ? "sim" : "não"}`,
      `CÁLCULO DO SISTEMA ${competencia}: receita ${brl(calc.receitaMes)} (exportação ${brl(calc.receitaExportacao)}) · RBT12 ${brl(calc.rbt12)}${calc.rbt12Estimado ? " (ESTIMADO)" : ""} · anexo ${calc.anexo} · alíquota efetiva ${(calc.aliquotaEfetiva * 100).toFixed(4)}% · Fator R ${calc.fatorR == null ? "n/a" : (calc.fatorR * 100).toFixed(2) + "%"} · retenções federais ${brl(calc.retencaoFederal)} · IRRF ${brl(calc.retencaoIrrf)} · DAS bruto ${brl(calc.dasBruto)} · DAS líquido ${brl(calc.dasLiquido)}`,
      calcAnt ? `MÊS ANTERIOR ${anterior}: receita ${brl(calcAnt.receitaMes)} · anexo ${calcAnt.anexo} · Fator R ${calcAnt.fatorR == null ? "n/a" : (calcAnt.fatorR * 100).toFixed(2) + "%"} · DAS ${brl(calcAnt.dasLiquido)}` : "MÊS ANTERIOR: sem cálculo",
      `RECEITA 12 MESES (notas): ${historico}`,
      `MOTIVOS:\n${calc.conferencia.motivos.map((m) => `- [${m.nivel}] ${m.codigo}: ${m.texto}`).join("\n")}`,
    ].join("\n\n");

    try {
      const r = await generateText({
        model: anthropic(modelo),
        tools: ferramentas(db, e.id),
        stopWhen: stepCountIs(8),
        output: Output.object({ schema: Resposta }),
        instructions: INSTRUCOES,
        messages: [{ role: "user", content: `<dados>\n${resumo}\n</dados>` }],
        maxOutputTokens: 2000,
      });
      const p = precos[modelo];
      const custo = p ? ((r.totalUsage?.inputTokens ?? r.usage.inputTokens ?? 0) * p[0] + (r.totalUsage?.outputTokens ?? r.usage.outputTokens ?? 0) * p[1]) / 1e6 : null;
      const out = r.output;
      // Trava no código: risco ou mudança de anexo nunca saem como APROVAR.
      const risco = calc.conferencia.motivos.some((m) => CODIGOS_RISCO.includes(m.codigo));
      const mudouAnexo = !!(calcAnt && calcAnt.receitaMes > 0 && calcAnt.anexo !== calc.anexo);
      const decisao = out.decisao === "APROVAR" && !risco && !mudouAnexo ? "APROVAR" : "ESCALAR";
      const pergunta =
        decisao === "ESCALAR"
          ? out.pergunta || (mudouAnexo ? `Anexo mudou de ${calcAnt!.anexo} para ${calc.anexo} — confirmar Fator R/atividade.` : out.diagnostico)
          : null;
      const acoes = out.acoes.map((a) => ({ acao: a.acao, onde: a.onde.replace("{id}", e.id) }));
      await db.from("serena_fechamentos").upsert(
        {
          company_id: e.id,
          competencia,
          ia_decisao: decisao,
          ia_justificativa: out.justificativa,
          ia_diagnostico: out.diagnostico,
          ia_acoes: acoes,
          ia_pergunta: pergunta,
          ia_assinatura: calc.assinatura,
          ia_modelo: modelo,
          ia_custo_usd: custo,
          ia_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "company_id,competencia" },
      );
      resultados.push({ companyId: e.id, decisao, justificativa: out.justificativa, pergunta, custoUsd: custo });
    } catch (err) {
      console.error("[serena-revisor]", e.id, err);
    }
  }
  return resultados;
}
