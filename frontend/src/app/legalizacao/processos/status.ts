import type { StatusTone } from "@/lib/formatters";

// Vocabulário exato do eLegalize, nos dois níveis (fase e processo).
export type StatusEfetivo =
  | "CONCLUIDO"
  | "AGUARDANDO_DADOS"
  | "A_CONFERIR"
  | "PARALISADO"
  | "ATRASADA"
  | "A_FAZER";

export const STATUS_LABELS: Record<StatusEfetivo, string> = {
  CONCLUIDO: "Concluído",
  AGUARDANDO_DADOS: "Aguardando dados",
  A_CONFERIR: "A conferir",
  PARALISADO: "Paralisado",
  ATRASADA: "Atrasada",
  A_FAZER: "A fazer",
};

export const STATUS_TONES: Record<StatusEfetivo, StatusTone> = {
  CONCLUIDO: "success",
  AGUARDANDO_DADOS: "neutral",
  A_CONFERIR: "warning",
  PARALISADO: "neutral",
  ATRASADA: "danger",
  A_FAZER: "neutral",
};

// Compara datas como string "YYYY-MM-DD" em vez de Date — evita erro de
// fuso horário (new Date("2026-09-25") é interpretado como UTC meia-noite,
// que já é dia 24 em horário de Brasília à noite).
export function hojeSaoPaulo(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export type FaseParaStatus = {
  data_conclusao: string | null;
  status_manual: "AGUARDANDO_DADOS" | "A_CONFERIR" | "PARALISADO" | null;
  prazo: string | null;
};

// Ordem de precedência real observada no eLegalize (caso "Winkler Clinic"):
// concluído > override manual (Paralisado etc.) > atrasado-se-prazo-passou > a fazer.
export function statusEfetivoFase(
  fase: FaseParaStatus,
  prazoFinalProcesso: string | null,
  hoje: string = hojeSaoPaulo(),
): StatusEfetivo {
  if (fase.data_conclusao) return "CONCLUIDO";
  if (fase.status_manual) return fase.status_manual;
  const prazo = fase.prazo ?? prazoFinalProcesso;
  if (prazo && prazo < hoje) return "ATRASADA";
  return "A_FAZER";
}

export type ProcessoParaStatus = {
  prazo_final: string | null;
  data_conclusao: string | null;
};

// Status do processo como um todo = status da fase "atual" (a primeira não
// concluída, na ordem do fluxo), ou Concluído se não sobrar nenhuma.
export function statusEfetivoProcesso(
  processo: ProcessoParaStatus,
  fases: FaseParaStatus[],
  hoje: string = hojeSaoPaulo(),
): StatusEfetivo {
  if (processo.data_conclusao) return "CONCLUIDO";
  const faseAtual = fases.find((f) => !f.data_conclusao);
  if (!faseAtual) return "CONCLUIDO";
  return statusEfetivoFase(faseAtual, processo.prazo_final, hoje);
}

export function andamento(fases: { data_conclusao: string | null }[]): number {
  if (fases.length === 0) return 0;
  const concluidas = fases.filter((f) => f.data_conclusao).length;
  return Math.round((concluidas / fases.length) * 100);
}

export const TIPO_PROCESSO_LABELS: Record<string, string> = {
  ABERTURA: "Abertura de empresa",
  ALTERACAO: "Alteração contratual",
  ENCERRAMENTO: "Encerramento de empresa",
};

export const ALTERACAO_ITEM_LABELS: Record<string, string> = {
  SOCIOS: "Sócios",
  CESSAO_COTAS: "Cessão de cotas",
  ADMINISTRACAO: "Administração",
  DENOMINACAO: "Denominação",
  ATIVIDADE: "Atividade",
  ENDERECO: "Endereço",
  CAPITAL_SOCIAL: "Capital social",
  OUTRO: "Outro",
};
