// Análise salva do simulador da Reforma (tabela reforma_analises) —
// tipos e regras usados tanto no servidor quanto na tela.

import type { EntradaSimulacao } from "@/lib/reforma-tributaria/motor";

export type StatusAnalise = "PENDENTE" | "SEM_MUDANCA" | "COM_MUDANCA";

export const ROTULO_STATUS: Record<StatusAnalise, string> = {
  PENDENTE: "Não analisado",
  SEM_MUDANCA: "Analisado — sem mudança",
  COM_MUDANCA: "Analisado — com mudança (reunião)",
};

export type LivroCaixa = {
  tem: boolean;
  mediaMensal: number | null;
  meses: Record<string, number>; // "YYYY-MM" → valor
};

export type AnaliseReforma = {
  status: StatusAnalise;
  observacao: string | null;
  livroCaixa: LivroCaixa;
  entrada: Partial<EntradaSimulacao> | null;
  regimeRecomendado: string | null;
  analisadoPor: string | null;
  analisadoEm: string | null;
};

export const LIVRO_CAIXA_VAZIO: LivroCaixa = { tem: false, mediaMensal: null, meses: {} };

export type ReceitaLivroCaixa = {
  anual: number;
  origem: "meses" | "media" | "meses+media" | "nenhum";
  mesesInformados: number;
};

// Receita anual do livro caixa a somar na simulação:
//  - só meses informados → soma e projeta para 12 meses;
//  - só média → média × 12;
//  - os dois → soma os meses informados e completa os que faltam com a média
//    (aproveita o dado real de cada mês e não perde a sazonalidade).
export function receitaLivroCaixaAnual(lc: LivroCaixa): ReceitaLivroCaixa {
  if (!lc.tem) return { anual: 0, origem: "nenhum", mesesInformados: 0 };
  const valores = Object.values(lc.meses).filter((v) => Number.isFinite(v) && v > 0);
  const n = Math.min(valores.length, 12);
  const soma = valores.reduce((a, v) => a + v, 0);
  const media = lc.mediaMensal != null && lc.mediaMensal > 0 ? lc.mediaMensal : null;
  if (n > 0 && media != null) return { anual: soma + media * (12 - n), origem: "meses+media", mesesInformados: n };
  if (n > 0) return { anual: (soma / n) * 12, origem: "meses", mesesInformados: n };
  if (media != null) return { anual: media * 12, origem: "media", mesesInformados: 0 };
  return { anual: 0, origem: "nenhum", mesesInformados: 0 };
}

// Campos da simulação que podem ser salvos (o resto vem sempre do sistema).
export const CAMPOS_ENTRADA_SALVOS = [
  "receitaAnual",
  "receitaHospitalarAnual",
  "salariosAnual",
  "proLaboreAnual",
  "fgtsAnual",
  "sujeitoFatorR",
  "aliquotaIss",
  "reducaoCbsIbs",
  "custosCreditaveisPct",
  "percentualB2b",
] as const satisfies readonly (keyof EntradaSimulacao)[];

export function aplicarAnalise(sistema: EntradaSimulacao, analise: AnaliseReforma | null): EntradaSimulacao {
  if (!analise) return sistema;
  const salvo: Partial<EntradaSimulacao> = {};
  for (const campo of CAMPOS_ENTRADA_SALVOS) {
    const v = analise.entrada?.[campo];
    if (v !== undefined && v !== null) (salvo as Record<string, unknown>)[campo] = v;
  }
  return {
    ...sistema,
    ...salvo,
    receitaLivroCaixaAnual: receitaLivroCaixaAnual(analise.livroCaixa).anual,
  };
}
