export type StatusTone = "danger" | "warning" | "success" | "neutral";

export function formatarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14) return cnpj;
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export const STATUS_PILL_CLASSES: Record<StatusTone, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  neutral: "bg-surface-muted text-foreground/50",
};

// Uma linha na tabela de exceção guarda o valor explícito de "aplicavel"
// pra essa empresa+tipo; na ausência dela, vale o padrão do próprio tipo.
export function tipoAplicavel(aplicaATodas: boolean, override: boolean | undefined): boolean {
  return override ?? aplicaATodas;
}

export function diasAteVencer(dataVencimento: string): number {
  return Math.ceil((new Date(dataVencimento).getTime() - Date.now()) / 86_400_000);
}

export function statusDocumento(documento?: { data_vencimento: string | null } | null): {
  label: string;
  tone: StatusTone;
} {
  if (!documento) return { label: "Sem documento", tone: "neutral" };
  if (documento.data_vencimento == null) return { label: "Validade indeterminada", tone: "success" };
  const dias = diasAteVencer(documento.data_vencimento);
  if (dias < 0) return { label: `Vencido há ${Math.abs(dias)} dia(s)`, tone: "danger" };
  if (dias <= 45) return { label: `Vence em ${dias} dia(s)`, tone: "warning" };
  return { label: "Válido", tone: "success" };
}
