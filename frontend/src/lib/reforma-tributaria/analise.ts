// Análise salva do simulador da Reforma (tabela reforma_analises) —
// tipos e regras usados tanto no servidor quanto na tela.

import type { EntradaSimulacao, RegimeSimulado } from "@/lib/reforma-tributaria/motor";
import { ENTRADA_PF_PADRAO, type EntradaPessoaFisica } from "@/lib/reforma-tributaria/pessoa-fisica";

export const REGIMES_SIMULADOS: RegimeSimulado[] = ["SIMPLES", "SIMPLES_HIBRIDO", "LUCRO_PRESUMIDO"];

export function ehRegimeSimulado(v: unknown): v is RegimeSimulado {
  return typeof v === "string" && (REGIMES_SIMULADOS as string[]).includes(v);
}

// Para onde dá para mudar: os outros regimes simulados. Simples ↔ híbrido
// também conta (é escolha do Simples, mas muda a apuração de CBS/IBS).
export function opcoesMudanca(regimeAtual: RegimeSimulado | null): RegimeSimulado[] {
  return REGIMES_SIMULADOS.filter((r) => r !== regimeAtual);
}

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
  // `pf`: dados do simulador pessoa física × PJ (só para CPF).
  entrada: (Partial<EntradaSimulacao> & { pf?: Partial<EntradaPessoaFisica> }) | null;
  // Coluna regime_recomendado: a MUDANÇA DECIDIDA pelo contador quando o
  // status é COM_MUDANCA (para qual regime o cliente vai). Null nos outros
  // status ou quando a mudança ainda não foi definida.
  mudancaPara: RegimeSimulado | null;
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

// Entrada do simulador pessoa física × PJ: o que foi salvo na análise (pf),
// senão o que o sistema sabe (receita das notas no CPF, redução do serviço).
export function entradaPessoaFisica(sistema: EntradaSimulacao, analise: AnaliseReforma | null): EntradaPessoaFisica {
  const pf = analise?.entrada?.pf ?? {};
  return {
    ...ENTRADA_PF_PADRAO,
    receitaAnual: sistema.receitaAnual,
    reducaoCbsIbs: sistema.reducaoCbsIbs,
    sujeitoFatorR: true, // profissional da saúde / regulamentado: em regra sujeito ao Fator R
    ...Object.fromEntries(Object.entries(pf).filter(([, v]) => v !== undefined && v !== null)),
  };
}

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
