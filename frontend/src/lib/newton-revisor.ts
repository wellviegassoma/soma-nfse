import "server-only";

// Revisor do Newton: mesmo desenho do da Serena (lib/serena-revisor.ts). O
// sistema monta o pacote (cadastro, notas do mês com retenções, receita de 12
// meses, cálculo do motor, MIT, prefeitura) e a IA, numa chamada só, AUDITA a
// apuração do Lucro Presumido e decide APROVAR/ESCALAR. Bloqueio nunca é
// decidido aqui; códigos de risco sempre escalam (trava no código).

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MODELO_PADRAO } from "@/lib/pedido-nota/extrair-core";
import { buscarFaturamentoMensalLote, somarFaturamento } from "@/lib/faturamento";
import { somarMeses } from "@/lib/tarefas-comum";
import { carregarEsteiraNewton, somarFiliais } from "@/lib/newton";
import { CONHECIMENTO_PRESUMIDO, MANUAL_NEWTON } from "@/lib/newton-conhecimento";

type Db = SupabaseClient;

const Resposta = z.object({
  decisao: z.enum(["APROVAR", "ESCALAR"]),
  justificativa: z.string().describe("Uma ou duas frases curtas: por que cada motivo está (ou não) explicado pelos dados."),
  diagnostico: z.string().describe("O problema e a causa provável, com números. No máximo 700 caracteres. Se está tudo certo, diga isso."),
  acoes: z
    .array(z.object({ acao: z.string().describe("O que fazer, no imperativo."), onde: z.string().describe("Caminho da tela no SOMA Gestão.") }))
    .describe("Correções sugeridas (vazio se APROVAR sem pendência)."),
  pergunta: z.string().nullable().describe("Se ESCALAR: a pergunta exata para a equipe. Se APROVAR: null."),
});

const INSTRUCOES = `Você é o Newton, analista fiscal da SOMA Contabilidade (Petrópolis), responsável pela apuração mensal do Lucro Presumido de prestadores de serviço (maioria da saúde) de Petrópolis e do Rio. O motor do sistema já calculou PIS, COFINS, IRPJ e CSLL (o cálculo é exato — não refaça a conta de cabeça); a conferência automática marcou a empresa como "Revisar" pelos MOTIVOS. Todos os dados estão no pacote abaixo. Seu trabalho é AUDITAR: receita do mês coerente com a prefeitura e o histórico, equiparação hospitalar só nas notas certas, retenções abatidas, adicional do IRPJ, filial somada — e decidir.

Regras de decisão:
- APROVE apenas quando CADA motivo estiver claramente explicado pelos dados do pacote (ex.: sem receita e sem notas há meses = empresa parada).
- ESCALE sempre que houver risco: equiparação hospitalar sem marcação ou duvidosa, diferença com a prefeitura sem explicação, queda/alta forte sem motivo nos dados, retenção maior que o tributo, dado faltando ou qualquer dúvida.
- Sempre preencha o diagnóstico e as ações com a tela exata do manual (troque {id} pelo id da empresa). Seja específico: cite notas, meses e valores.
- Nunca invente dados; não use conhecimento externo sobre a empresa. Responda em português.

${CONHECIMENTO_PRESUMIDO}

${MANUAL_NEWTON}`;

const CODIGOS_RISCO = ["EQUIPARACAO_SEM_MARCACAO", "PREFEITURA_DIVERGE", "RETENCAO_MAIOR", "RETENCAO_MAIOR_IRPJ", "NOTAS_ERRO"];

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function montarPacote(db: Db, companyId: string, competencia: string): Promise<string> {
  const [{ data: c }, { data: cert }, { data: notas }, { data: mits }, { data: pref }, { data: iss }] = await Promise.all([
    db
      .from("companies")
      .select("municipality_name, irpj_csll_apuracao_mensal, equiparacao_hospitalar, iss_tipo, cnae")
      .eq("id", companyId)
      .maybeSingle(),
    db.from("certificates").select("expires_at").eq("company_id", companyId).maybeSingle(),
    db
      .from("notas_distribuidas")
      .select("numero, data_emissao, cancelada, valor_servico, tipo_retencao_issqn, valor_ret_irrf, valor_ret_csll, equiparacao_hospitalar, descricao_servico, tomador_nome")
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .gte("competencia", `${competencia}-01`)
      .lt("competencia", `${somarMeses(competencia, 1)}-01`)
      .order("data_emissao")
      .limit(60),
    db.from("integra_contador_mit_encerramentos").select("competencia, situacao_apuracao, dados_enviados").eq("company_id", companyId).order("competencia", { ascending: false }).limit(4),
    db.from("conferencia_prefeitura").select("competencia, valor_prefeitura, valor_notas, erro").eq("company_id", companyId).order("competencia", { ascending: false }).limit(4),
    db.from("iss_fechamentos").select("competencia, valor_guia, origem").eq("company_id", companyId).order("competencia", { ascending: false }).limit(3),
  ]);
  const certTxt = cert ? (new Date(cert.expires_at as string) > new Date() ? `válido até ${String(cert.expires_at).slice(0, 10)}` : "VENCIDO") : "não cadastrado";
  const linhas = (notas ?? []).map(
    (n) =>
      `nº ${n.numero ?? "?"} ${String(n.data_emissao ?? "").slice(0, 10)} ${brl(Number(n.valor_servico ?? 0))}${n.cancelada ? " CANCELADA" : ""}${n.equiparacao_hospitalar ? " [HOSPITALAR]" : ""}${Number(n.valor_ret_irrf ?? 0) ? ` IRRF ret. ${brl(Number(n.valor_ret_irrf))}` : ""}${Number(n.valor_ret_csll ?? 0) ? ` PIS/COFINS/CSLL ret. ${brl(Number(n.valor_ret_csll))}` : ""} · ${(n.descricao_servico ?? "").slice(0, 50)} · ${(n.tomador_nome ?? "").slice(0, 30)}`,
  );
  return [
    `CADASTRO: município ${c?.municipality_name ?? "?"} · apuração IRPJ/CSLL ${c?.irpj_csll_apuracao_mensal ? "MENSAL" : "trimestral"} · equiparação hospitalar ${c?.equiparacao_hospitalar ? "SIM (marcar nota a nota)" : "não"} · ISS ${c?.iss_tipo ?? "?"} · CNAE ${c?.cnae ?? "?"} · certificado ${certTxt}`,
    `NOTAS EMITIDAS NA COMPETÊNCIA (${linhas.length}${linhas.length === 60 ? "+, lista cortada" : ""}):\n${linhas.join("\n") || "(nenhuma)"}`,
    `MIT ENCERRADOS PELO SISTEMA: ${(mits ?? []).map((m) => `${m.competencia}: ${m.situacao_apuracao}`).join(" | ") || "nenhum (a equipe declarava por fora até out/2026)"}`,
    `CONFERÊNCIAS COM A PREFEITURA: ${(pref ?? []).map((p) => `${p.competencia}: ${p.erro ? `erro (${String(p.erro).slice(0, 60)})` : `prefeitura ${brl(Number(p.valor_prefeitura ?? 0))} × notas ${brl(Number(p.valor_notas ?? 0))}`}`).join(" | ") || "nenhuma"}`,
    `ISS FECHADO: ${(iss ?? []).map((i) => `${i.competencia}: ${i.valor_guia == null ? "sem valor" : brl(Number(i.valor_guia))} (${i.origem})`).join(" | ") || "nenhum"}`,
  ].join("\n\n");
}

export type ResultadoRevisaoNewton = { companyId: string; decisao: "APROVAR" | "ESCALAR"; justificativa: string; pergunta: string | null; custoUsd: number | null };

export async function revisarComIaNewton(db: Db, competencia: string, companyIds: string[]): Promise<ResultadoRevisaoNewton[]> {
  if (!companyIds.length) return [];
  const alvo = new Set(companyIds);
  const linhas = (await carregarEsteiraNewton(db, competencia)).filter((l) => alvo.has(l.id) && l.conferencia === "REVISAR" && !l.aprovada);
  if (!linhas.length) return [];
  const fat = await buscarFaturamentoMensalLote(db, [...linhas.map((l) => l.id), ...linhas.flatMap((l) => l.filiais.map((f) => f.id))]);
  const modelo = process.env.NEWTON_MODELO || process.env.SERENA_MODELO || MODELO_PADRAO;
  const precos: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };
  const resultados: ResultadoRevisaoNewton[] = [];

  for (const l of linhas) {
    const { notas } = somarFiliais(fat.get(l.id), l.filiais.map((f) => fat.get(f.id)));
    const historico = Array.from({ length: 12 }, (_, i) => somarMeses(competencia, -i))
      .map((m) => `${m}: ${brl(somarFaturamento(notas, [m]))}`)
      .join(" | ");
    const c = l.calc;
    const resumo = [
      `EMPRESA id=${l.id}: ${l.nome} | ${l.municipio}${l.filiais.length ? ` | inclui filial: ${l.filiais.map((f) => f.nome).join(", ")}` : ""}`,
      `CÁLCULO DO SISTEMA ${competencia}: receita do mês ${brl(c.receitaMes)} (hospitalar marcada ${brl(c.receitaHospitalarMes)}) · receita do trimestre ${brl(c.receitaTrimestre)} (hospitalar ${brl(c.receitaHospitalarTrimestre)}) · ${c.fechaTrimestre ? "mês de IRPJ/CSLL" : "só PIS/COFINS neste mês"} · bruto: IRPJ ${brl(c.bruto.irpj)} (adicional ${brl(c.bruto.irpjAdicional)}) CSLL ${brl(c.bruto.csll)} PIS ${brl(c.bruto.pis)} COFINS ${brl(c.bruto.cofins)} · retenções do mês: IRRF ${brl(c.retencaoMes.irrf)} PIS/COFINS/CSLL ${brl(c.retencaoMes.contribuicoesSociais)} · DEVIDO no MIT: IRPJ ${brl(c.devido.irpj)} CSLL ${brl(c.devido.csll)} PIS ${brl(c.devido.pis)} COFINS ${brl(c.devido.cofins)} = ${brl(c.total)}`,
      `RECEITA 12 MESES (notas): ${historico}`,
      `MOTIVOS:\n${l.motivos.map((m) => `- [${m.nivel}] ${m.codigo}: ${m.texto}`).join("\n")}`,
    ].join("\n\n");
    try {
      const pacote = await montarPacote(db, l.id, competencia);
      const r = await generateText({
        model: anthropic(modelo),
        output: Output.object({ schema: Resposta }),
        instructions: INSTRUCOES,
        messages: [{ role: "user", content: `<dados>\n${resumo}\n\n${pacote}\n</dados>` }],
        maxOutputTokens: 5000,
      });
      const p = precos[modelo];
      const custo = p ? ((r.totalUsage?.inputTokens ?? r.usage.inputTokens ?? 0) * p[0] + (r.totalUsage?.outputTokens ?? r.usage.outputTokens ?? 0) * p[1]) / 1e6 : null;
      const out = r.output;
      const risco = l.motivos.some((m) => CODIGOS_RISCO.includes(m.codigo));
      const decisao = out.decisao === "APROVAR" && !risco ? "APROVAR" : "ESCALAR";
      const pergunta = decisao === "ESCALAR" ? out.pergunta || out.diagnostico : null;
      const acoes = out.acoes.map((a) => ({ acao: a.acao, onde: a.onde.replaceAll("{id}", l.id) }));
      await db.from("newton_fechamentos").upsert(
        {
          company_id: l.id,
          competencia,
          ia_decisao: decisao,
          ia_justificativa: out.justificativa,
          ia_diagnostico: out.diagnostico,
          ia_acoes: acoes,
          ia_pergunta: pergunta,
          ia_assinatura: l.assinatura,
          ia_modelo: modelo,
          ia_custo_usd: custo,
          ia_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: "company_id,competencia" },
      );
      resultados.push({ companyId: l.id, decisao, justificativa: out.justificativa, pergunta, custoUsd: custo });
    } catch (err) {
      console.error("[newton-revisor]", l.id, err);
    }
  }
  return resultados;
}
