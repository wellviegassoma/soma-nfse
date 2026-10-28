// Regras do acompanhamento de certificados — sem "server-only", usadas
// também pela tela (client component).

export const DIAS_VENCENDO = 45;

export const ETAPAS = [
  "PENDENTE",
  "AGUARDANDO_CLIENTE",
  "AGUARDANDO_PAGAMENTO",
  "RESOLVIDO",
  "NAO_SE_APLICA",
] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETAPA_LABEL: Record<Etapa, string> = {
  PENDENTE: "Pendente",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  AGUARDANDO_PAGAMENTO: "Aguardando pagamento",
  RESOLVIDO: "Resolvido",
  NAO_SE_APLICA: "Não se aplica",
};

export type Situacao = "SEM" | "VENCIDO" | "VENCENDO" | "VALIDO";

export const SITUACAO_LABEL: Record<Situacao, string> = {
  SEM: "Sem certificado",
  VENCIDO: "Vencido",
  VENCENDO: `Vencendo (${DIAS_VENCENDO} dias)`,
  VALIDO: "Válido",
};

export function diasAteVencer(expiresAt: string, agora: number): number {
  return Math.ceil((new Date(expiresAt).getTime() - agora) / 86_400_000);
}

export function situacaoCertificado(expiresAt: string | null, agora: number): Situacao {
  if (!expiresAt) return "SEM";
  const dias = diasAteVencer(expiresAt, agora);
  if (dias < 0) return "VENCIDO";
  return dias <= DIAS_VENCENDO ? "VENCENDO" : "VALIDO";
}

function mesmoVencimento(a: string | null, b: string | null) {
  if (!a || !b) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Etapa que vale hoje. A etapa guardada só vale pro mesmo certificado em
 * que foi marcada (`referenteVencimento`); se o certificado mudou desde
 * então, o ciclo anterior acabou: RESOLVIDO se o atual está válido, senão
 * PENDENTE (venceu de novo). null = empresa fora do fluxo (certificado
 * válido e nada registrado).
 */
export function etapaAtual(
  acomp: { status: Etapa; referente_vencimento: string | null } | null,
  expiresAt: string | null,
  agora: number,
): { etapa: Etapa; doCicloAtual: boolean } | null {
  const situacao = situacaoCertificado(expiresAt, agora);
  if (acomp && mesmoVencimento(acomp.referente_vencimento, expiresAt)) {
    return { etapa: acomp.status, doCicloAtual: true };
  }
  if (acomp && situacao === "VALIDO") return { etapa: "RESOLVIDO", doCicloAtual: false };
  if (situacao === "VALIDO") return null;
  return { etapa: "PENDENTE", doCicloAtual: false };
}
