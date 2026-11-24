import "server-only";

// Notas da empresa para os chats da Serena e do Newton: as notas de saída da
// competência (base nacional/ADN, que já inclui as emitidas pelo sistema),
// com descrição, código do serviço, tomador, ISS retido e retenções, mais um
// resumo por código. Só leitura.

import type { SupabaseClient } from "@supabase/supabase-js";
import { somarMeses } from "@/lib/tarefas-comum";
import { buscarFaturamentoMensalLote, somarFaturamento } from "@/lib/faturamento";

type Db = SupabaseClient;

export type NotaParaAnalise = {
  id: string;
  numero: string | null;
  emissao: string | null;
  valor: number;
  cancelada: boolean;
  codigoServico: string | null;
  descricao: string;
  tomador: string | null;
  tomadorTipo: "PJ" | "PF" | "?";
  issRetido: boolean;
  valorIss: number | null;
  irrfRetido: number;
  pisCofinsCsllRetido: number;
  exportacao: boolean;
  equiparacaoMarcada: boolean;
};

export async function notasParaAnalise(
  db: Db,
  companyIds: string[],
  competencia: string,
  filtro?: string | null,
): Promise<{ notas: NotaParaAnalise[]; total: number; porCodigo: { codigo: string | null; qtd: number; valor: number; exemplo: string }[] }> {
  const { data } = await db
    .from("notas_distribuidas")
    .select(
      "id, numero, data_emissao, valor_servico, cancelada, codigo_trib_nacional, descricao_servico, tomador_nome, tomador_cnpj, tipo_retencao_issqn, valor_issqn, valor_ret_irrf, valor_ret_csll, exportacao, equiparacao_hospitalar",
    )
    .in("company_id", companyIds)
    .eq("direcao", "saida")
    .gte("competencia", `${competencia}-01`)
    .lt("competencia", `${somarMeses(competencia, 1)}-01`)
    .order("data_emissao")
    .limit(1000);
  const q = (filtro ?? "").trim().toLowerCase();
  const todas: NotaParaAnalise[] = (data ?? []).map((n) => {
    const doc = String(n.tomador_cnpj ?? "").replace(/\D/g, "");
    return {
      id: n.id as string,
      numero: (n.numero as string | null) ?? null,
      emissao: n.data_emissao ? String(n.data_emissao).slice(0, 10) : null,
      valor: Number(n.valor_servico ?? 0),
      cancelada: n.cancelada === true,
      codigoServico: (n.codigo_trib_nacional as string | null) ?? null,
      descricao: String(n.descricao_servico ?? "").replace(/\s+/g, " ").slice(0, 220),
      tomador: (n.tomador_nome as string | null) ?? null,
      tomadorTipo: doc.length === 14 ? "PJ" : doc.length === 11 ? "PF" : "?",
      issRetido: n.tipo_retencao_issqn === 2 || n.tipo_retencao_issqn === 3,
      valorIss: n.valor_issqn == null ? null : Number(n.valor_issqn),
      irrfRetido: Number(n.valor_ret_irrf ?? 0),
      pisCofinsCsllRetido: Number(n.valor_ret_csll ?? 0),
      exportacao: n.exportacao === true,
      equiparacaoMarcada: n.equiparacao_hospitalar === true,
    };
  });
  const validas = todas.filter((n) => !n.cancelada);
  const grupos = new Map<string, { codigo: string | null; qtd: number; valor: number; exemplo: string }>();
  for (const n of validas) {
    const k = n.codigoServico ?? "";
    const g = grupos.get(k) ?? { codigo: n.codigoServico, qtd: 0, valor: 0, exemplo: n.descricao.slice(0, 90) };
    g.qtd++;
    g.valor += n.valor;
    grupos.set(k, g);
  }
  const filtradas = q
    ? todas.filter((n) => `${n.numero ?? ""} ${n.descricao} ${n.tomador ?? ""} ${n.codigoServico ?? ""}`.toLowerCase().includes(q))
    : todas;
  return {
    notas: filtradas.slice(0, 80),
    total: filtradas.length,
    porCodigo: [...grupos.values()].map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100 })).sort((a, b) => b.valor - a.valor),
  };
}

/**
 * Faturamento (notas, sem canceladas) de cada empresa da carteira mês a mês —
 * para o chat comparar meses sem limite de empresas. Filial soma na matriz.
 */
export async function faturamentoCarteira(
  db: Db,
  empresas: { id: string; nome: string; idsNotas: string[] }[],
  ate: string,
  meses: number,
): Promise<{ meses: string[]; linhas: string[]; totais: Record<string, number>; semFaturamento: Record<string, number> }> {
  const lista = Array.from({ length: meses }, (_, i) => somarMeses(ate, -(meses - 1 - i)));
  const fat = await buscarFaturamentoMensalLote(db, empresas.flatMap((e) => e.idsNotas));
  const totais: Record<string, number> = Object.fromEntries(lista.map((m) => [m, 0]));
  const semFaturamento: Record<string, number> = Object.fromEntries(lista.map((m) => [m, 0]));
  const linhas = empresas.map((e) => {
    const notas = e.idsNotas.flatMap((id) => fat.get(id)?.notas ?? []);
    const valores = lista.map((m) => {
      const v = Math.round(somarFaturamento(notas, [m]) * 100) / 100;
      totais[m] += v;
      if (v <= 0) semFaturamento[m]++;
      return v;
    });
    return `${e.nome} | ${valores.map((v) => (v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "0")).join(" | ")}`;
  });
  for (const m of lista) totais[m] = Math.round(totais[m] * 100) / 100;
  return { meses: lista, linhas, totais, semFaturamento };
}
