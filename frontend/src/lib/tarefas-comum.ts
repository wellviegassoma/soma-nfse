// Módulo de Tarefas — tipos e regras puras (usados no servidor e nas telas).
// Desenho: docs/tarefas.md §6.

export type StatusTarefa = "A_FAZER" | "EM_ANDAMENTO" | "CONCLUIDA" | "NAO_SE_APLICA";

export const STATUS_ROTULO: Record<StatusTarefa, string> = {
  A_FAZER: "A fazer",
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
  NAO_SE_APLICA: "Não se aplica",
};

export const REGIMES: { valor: string; rotulo: string }[] = [
  { valor: "SIMPLES_NACIONAL", rotulo: "Simples" },
  { valor: "LUCRO_PRESUMIDO", rotulo: "Presumido" },
  { valor: "LUCRO_REAL", rotulo: "Real" },
  { valor: "IMUNE_ISENTO", rotulo: "Imune/Isento" },
];

// Centrais que concluem tarefa/etapa sozinhas (lib/tarefas-automacao.ts).
export type FonteAutomatica =
  | "SIMPLES_APROVADO"
  | "PGDAS_TRANSMITIDO"
  | "DAS_PAGO"
  | "MIT_ENCERRADA"
  | "ISS_MARCADO"
  | "ISS_PAGO"
  | "REINF_ENVIADA"
  | "EXTRATOS_ENTREGUES"
  | "MES_FECHADO";

export const FONTES_ROTULO: Record<FonteAutomatica, string> = {
  SIMPLES_APROVADO: "Conferência do Simples aprovada",
  PGDAS_TRANSMITIDO: "PGDAS-D transmitido",
  DAS_PAGO: "DAS pago",
  MIT_ENCERRADA: "MIT/DCTFWeb encerrada",
  ISS_MARCADO: "ISS marcado na Central ISS",
  ISS_PAGO: "ISS pago",
  REINF_ENVIADA: "Reinf enviada (dispensada ⇒ não se aplica)",
  EXTRATOS_ENTREGUES: "Extratos do mês entregues",
  MES_FECHADO: "Mês fechado",
};

export function aberta(status: StatusTarefa): boolean {
  return status === "A_FAZER" || status === "EM_ANDAMENTO";
}

/**
 * Situação calculada (não gravada) de uma tarefa em relação a hoje.
 * RISCO = passou do prazo legal; ATRASADA = passou da meta SOMA.
 */
export type Situacao = "CONCLUIDA" | "NAO_SE_APLICA" | "AGUARDANDO_CLIENTE" | "RISCO" | "ATRASADA" | "HOJE" | "SEMANA" | "DEPOIS" | "SEM_PRAZO";

export function situacaoTarefa(
  t: { status: StatusTarefa; prazo_meta: string | null; prazo_legal: string | null; aguardando_cliente?: boolean },
  hoje: string,
): Situacao {
  if (t.status === "CONCLUIDA") return "CONCLUIDA";
  if (t.status === "NAO_SE_APLICA") return "NAO_SE_APLICA";
  // A SOMA já fez a parte dela; só falta o cliente (ex.: pagar a guia).
  if (t.aguardando_cliente) return "AGUARDANDO_CLIENTE";
  if (t.prazo_legal && t.prazo_legal < hoje) return "RISCO";
  const alvo = t.prazo_meta ?? t.prazo_legal;
  if (!alvo) return "SEM_PRAZO";
  if (alvo < hoje) return "ATRASADA";
  if (alvo === hoje) return "HOJE";
  if (alvo <= somarDias(hoje, 6)) return "SEMANA";
  return "DEPOIS";
}

export const SITUACAO_ROTULO: Record<Situacao, string> = {
  CONCLUIDA: "Concluída",
  NAO_SE_APLICA: "Não se aplica",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  RISCO: "Risco de multa",
  ATRASADA: "Atrasada",
  HOJE: "Hoje",
  SEMANA: "Próximos 7 dias",
  DEPOIS: "Depois",
  SEM_PRAZO: "Prazo a definir",
};

// Classes exclusivas (o `cn` do projeto não resolve conflito de classes).
export const SITUACAO_CLASSE: Record<Situacao, string> = {
  CONCLUIDA: "bg-success-soft text-success",
  NAO_SE_APLICA: "bg-surface-muted text-foreground/50",
  AGUARDANDO_CLIENTE: "bg-sky-100 text-sky-900",
  RISCO: "bg-rose-900 text-white",
  ATRASADA: "bg-rose-100 text-rose-800",
  HOJE: "bg-amber-300 text-amber-950",
  SEMANA: "bg-amber-100 text-amber-900",
  DEPOIS: "bg-brand-soft text-brand",
  SEM_PRAZO: "bg-surface-muted text-foreground/60",
};

export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

export function somarMeses(competencia: string, n: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function rotuloCompetencia(c: string): string {
  const [a, m] = c.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

export function ddmm(iso: string | null): string {
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—";
}
