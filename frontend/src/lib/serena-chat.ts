import "server-only";

// Ferramentas da conversa com a Serena (aba lateral). Três tipos:
// - consultas (sem custo, sem efeito);
// - ações seguras que ela executa direto (motor da prefeitura, auditoria IA);
// - propostas que mudam dado (classificar serviços): ela prepara, a pessoa
//   confirma no cartão da conversa — só então o sistema aplica.
// Transmitir PGDAS e mandar mensagem a cliente NÃO existem aqui.

import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarEsteira, carteiraSerena, type LinhaSerena } from "@/lib/serena";
import { rodarRotinaSerena } from "@/lib/serena-rotina";
import { carregarDadosSimplesLote } from "@/lib/simples-linha";
import { ATIVIDADES_SIMPLES_NACIONAL, buscarAtividade } from "@/lib/simples-nacional-atividades";
import { sugerirAtividade } from "@/lib/lc116-sugestao-atividade";

type Db = SupabaseClient;
const COMP = z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Competência AAAA-MM (padrão: a do fechamento atual).");

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function resumoLinha(l: LinhaSerena) {
  return {
    empresa: l.nome,
    municipio: l.municipio,
    situacao: l.situacao === "acao" ? "precisa de ação" : l.situacao === "concluida" ? "concluída" : "com a Serena",
    etapas: l.etapas.map((e) => `${e.nome}: ${e.titulo}${e.detalhe ? ` (${e.detalhe})` : ""}`).join(" → "),
    recado: l.recado,
    motivos: l.motivos.map((m) => `[${m.nivel}] ${m.texto}`),
    decisaoSerena: l.serena?.ia_decisao ?? null,
  };
}

export type ItemClassificacao = {
  id: string; // serviceId (SERVICO) ou "companyId|codigo" (CODIGO)
  tipo: "SERVICO" | "CODIGO";
  companyId: string;
  empresa: string;
  servico: string;
  codigo: string | null;
  atividadeId: string;
  atividade: string;
  tratamento: string;
  citacao: string;
  origem: "REGRA" | "SERENA";
  motivo: string;
};

/** Serviços/códigos das notas do mês sem atividade do Simples, na carteira da Serena. */
async function pendenciasClassificacao(db: Db, competencia: string) {
  const empresas = await carteiraSerena(db);
  const nome = new Map(empresas.map((e) => [e.id, e.trade_name || e.legal_name]));
  const dados = await carregarDadosSimplesLote(db, empresas.map((e) => e.id));
  const pend = new Map<string, { companyId: string; codigo: string | null; descricao: string; valor: number }>();
  for (const [companyId, d] of dados) {
    for (const n of d.notasPorAtividade) {
      if (n.competencia !== competencia || n.cancelada || n.atividadeId) continue;
      const chave = `${companyId}|${n.codigo ?? ""}|${n.descricao}`;
      const p = pend.get(chave) ?? { companyId, codigo: n.codigo, descricao: n.descricao, valor: 0 };
      p.valor += n.valor;
      pend.set(chave, p);
    }
  }
  const lista = [...pend.values()];
  if (!lista.length) return [];
  const { data: servicos } = await db
    .from("services")
    .select("id, company_id, name, national_tax_code, atividade_simples_nacional")
    .in("company_id", [...new Set(lista.map((p) => p.companyId))]);
  return lista.map((p) => {
    const s = (servicos ?? []).find(
      (x) => x.company_id === p.companyId && (x.name === p.descricao || (p.codigo && x.national_tax_code === p.codigo && !x.atividade_simples_nacional)),
    );
    const sug = sugerirAtividade(p.codigo);
    return {
      id: s ? (s.id as string) : `${p.companyId}|${p.codigo ?? ""}`,
      tipo: s ? ("SERVICO" as const) : ("CODIGO" as const),
      companyId: p.companyId,
      empresa: nome.get(p.companyId) ?? "—",
      servico: p.descricao,
      codigo: p.codigo,
      valorNoMes: Math.round(p.valor * 100) / 100,
      sugestaoDaRegra: sug ? { atividadeId: sug.id, descricao: sug.descricao, tratamento: sug.tratamento } : null,
    };
  });
}

export function ferramentasSerena(db: Db, userId: string, competenciaPadrao: string) {
  let cacheEsteira: { comp: string; linhas: LinhaSerena[] } | null = null;
  const esteira = async (comp: string) => {
    if (cacheEsteira?.comp !== comp) cacheEsteira = { comp, linhas: await carregarEsteira(db, comp) };
    return cacheEsteira.linhas;
  };

  return {
    resumoCarteira: tool({
      description: "Resumo da carteira da Serena na competência: quantas em cada situação, bloqueios mais comuns, prontas para transmitir, DAS gerados/entregues/pagos.",
      inputSchema: z.object({ competencia: COMP }),
      execute: async ({ competencia }) => {
        const comp = competencia ?? competenciaPadrao;
        const l = await esteira(comp);
        const motivos = new Map<string, number>();
        for (const x of l) if (x.situacao === "acao") motivos.set(x.recado.split(":")[0].slice(0, 60), (motivos.get(x.recado.split(":")[0].slice(0, 60)) ?? 0) + 1);
        return {
          competencia: comp,
          total: l.length,
          precisamDeAcao: l.filter((x) => x.situacao === "acao").length,
          comASerena: l.filter((x) => x.situacao === "serena").length,
          concluidas: l.filter((x) => x.situacao === "concluida").length,
          bloqueadas: l.filter((x) => x.conferencia === "BLOQUEADO").length,
          emRevisar: l.filter((x) => x.conferencia === "REVISAR" && !x.aprovada).length,
          prontasParaTransmitir: l.filter((x) => x.aprovada && !x.declarada).length,
          transmitidas: l.filter((x) => x.declarada).length,
          dasGerados: l.filter((x) => x.serena?.das_gerado_em).length,
          entregues: l.filter((x) => x.serena?.entregue_em).length,
          pagos: l.filter((x) => x.pago).length,
          principaisPendencias: [...motivos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
        };
      },
    }),

    listarEmpresas: tool({
      description: "Lista empresas da carteira por situação: bloqueadas, revisar, prontas (para transmitir), escaladas (com a equipe), sem_grupo (sem grupo do WhatsApp), guias_iss (Rio: guia de ISS pendente na Nota Carioca, fora do DAS, ex. 1287), concluidas, ou todas.",
      inputSchema: z.object({
        filtro: z.enum(["bloqueadas", "revisar", "prontas", "escaladas", "sem_grupo", "guias_iss", "concluidas", "todas"]),
        competencia: COMP,
      }),
      execute: async ({ filtro, competencia }) => {
        const l = await esteira(competencia ?? competenciaPadrao);
        const sel = l.filter((x) =>
          filtro === "bloqueadas" ? x.conferencia === "BLOQUEADO"
          : filtro === "revisar" ? x.conferencia === "REVISAR" && !x.aprovada
          : filtro === "prontas" ? x.aprovada && !x.declarada
          : filtro === "escaladas" ? x.serena?.ia_decisao === "ESCALAR" && !x.aprovada
          : filtro === "sem_grupo" ? !x.temGrupoDigisac
          : filtro === "guias_iss" ? x.guiasIss.pendentes.length > 0
          : filtro === "concluidas" ? x.situacao === "concluida"
          : true,
        );
        return {
          quantidade: sel.length,
          empresas: sel.slice(0, 60).map((x) =>
            filtro === "guias_iss"
              ? `${x.nome} — ${x.guiasIss.pendentes.map((p) => `${p.competencia} R$ ${(p.valor ?? 0).toFixed(2)}${p.receita ? ` (${p.receita})` : ""}`).join("; ")}`
              : `${x.nome} — ${x.recado.slice(0, 140)}`,
          ),
        };
      },
    }),

    detalheEmpresa: tool({
      description: "Esteira completa de uma empresa da carteira (busca por nome ou código): etapas, recado, motivos da conferência e decisão da Serena.",
      inputSchema: z.object({ busca: z.string().min(2), competencia: COMP }),
      execute: async ({ busca, competencia }) => {
        const l = await esteira(competencia ?? competenciaPadrao);
        const q = semAcento(busca);
        const achadas = l.filter((x) => semAcento(x.nome).includes(q));
        if (!achadas.length) return { erro: "Nenhuma empresa da carteira da Serena com esse nome." };
        return { empresas: achadas.slice(0, 3).map(resumoLinha) };
      },
    }),

    conferirPrefeitura: tool({
      description: "AÇÃO SEGURA (só consulta): roda agora o motor do sistema que confere com a Prefeitura de Petrópolis o faturamento das empresas ainda não conferidas. Sem IA, sem custo.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(25).default(15), competencia: COMP }),
      execute: async ({ limite, competencia }) => {
        const r = await rodarRotinaSerena(db, competencia ?? competenciaPadrao, { conferencias: limite, revisoes: 0 }, "motor");
        cacheEsteira = null;
        return { conferidasComSucesso: r.conferidas, erro: r.erro ?? null };
      },
    }),

    auditarComIa: tool({
      description: "AÇÃO SEGURA (custo pequeno, ~US$0,07 por empresa): audita com IA as empresas em 'Revisar' sem decisão atual; casos que não aprova viram tarefa para Paulo/Douglas.",
      inputSchema: z.object({ limite: z.number().int().min(1).max(8).default(5), competencia: COMP }),
      execute: async ({ limite, competencia }) => {
        const r = await rodarRotinaSerena(db, competencia ?? competenciaPadrao, { conferencias: 0, revisoes: limite }, "ia");
        cacheEsteira = null;
        return { revisadas: r.revisadas, recomendaAprovar: r.aprovadas, passadasParaEquipe: r.escaladas, faltam: r.faltamRevisar, custoUsd: Math.round(r.custoUsd * 100) / 100, erro: r.erro ?? null };
      },
    }),

    servicosSemAtividade: tool({
      description:
        "Lista os serviços das notas do mês (na carteira) que ainda não têm atividade do Simples Nacional — isso BLOQUEIA a declaração. Traz a sugestão da regra do sistema quando existe e a lista de atividades possíveis. Use antes de propor a classificação.",
      inputSchema: z.object({ competencia: COMP }),
      execute: async ({ competencia }) => {
        const itens = await pendenciasClassificacao(db, competencia ?? competenciaPadrao);
        return {
          quantidade: itens.length,
          itens,
          atividadesPossiveis: ATIVIDADES_SIMPLES_NACIONAL.map((a) => ({ id: a.id, descricao: a.descricao.slice(0, 160), tratamento: a.tratamento, citacao: a.citacao })),
        };
      },
    }),

    proporClassificacao: tool({
      description:
        "PROPOSTA (não aplica nada): registra a classificação sugerida para os serviços sem atividade. A pessoa vê um cartão e confirma; só então o sistema grava. Use os ids de servicosSemAtividade e ids de atividadesPossiveis. Prefira a sugestão da regra quando existir; senão escolha pela descrição/código e explique.",
      inputSchema: z.object({
        itens: z
          .array(z.object({ id: z.string(), atividadeId: z.string(), motivo: z.string().describe("Por que essa atividade (uma frase, cite a lei).") }))
          .min(1),
        competencia: COMP,
      }),
      execute: async ({ itens, competencia }) => {
        const pend = await pendenciasClassificacao(db, competencia ?? competenciaPadrao);
        const porId = new Map(pend.map((p) => [p.id, p]));
        const validos: ItemClassificacao[] = [];
        const recusados: string[] = [];
        for (const i of itens) {
          const p = porId.get(i.id);
          const a = buscarAtividade(i.atividadeId);
          if (!p || !a) {
            recusados.push(i.id);
            continue;
          }
          validos.push({
            id: p.id,
            tipo: p.tipo,
            companyId: p.companyId,
            empresa: p.empresa,
            servico: p.servico,
            codigo: p.codigo,
            atividadeId: a.id,
            atividade: a.descricao,
            tratamento: a.tratamento,
            citacao: a.citacao,
            origem: p.sugestaoDaRegra?.atividadeId === a.id ? "REGRA" : "SERENA",
            motivo: i.motivo,
          });
        }
        if (!validos.length) return { erro: "Nenhum item válido (ids não conferem com os serviços pendentes)." };
        const { data, error } = await db
          .from("serena_propostas")
          .insert({ user_id: userId, tipo: "CLASSIFICAR_SERVICOS", titulo: `Classificar ${validos.length} serviço(s) na atividade do Simples`, itens: validos })
          .select("id")
          .single();
        if (error) return { erro: error.message };
        return { propostaId: data.id, itens: validos.length, recusados, aviso: "Aguardando a confirmação da pessoa no cartão." };
      },
    }),
  };
}
