import type { StatusTone } from "@/lib/formatters";

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
