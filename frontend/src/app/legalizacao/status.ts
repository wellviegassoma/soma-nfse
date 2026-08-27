export type StatusTone = "danger" | "warning" | "success" | "neutral";

export function formatarCnpj(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const digitos = cnpj.replace(/\D/g, "");
  if (digitos.length !== 14) return cnpj;
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

type EnderecoEmpresa = {
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_zip: string | null;
  municipality_name: string | null;
  state: string | null;
};

// Retorna null quando não há NENHUM dado de endereço — a chamada exibe
// "Não cadastrado" nesse caso, em vez de uma string vazia estranha.
export function formatarEndereco(empresa: EnderecoEmpresa): string | null {
  const rua = [empresa.address_street, empresa.address_number].filter(Boolean).join(", ");
  const linha1 = [rua, empresa.address_complement].filter(Boolean).join(" - ");
  const cidadeUf = [empresa.municipality_name, empresa.state].filter(Boolean).join("/");
  const linha2 = [empresa.address_neighborhood, cidadeUf || null].filter(Boolean).join(", ");
  const cepFormatado = empresa.address_zip?.replace(/(\d{5})(\d{3})/, "$1-$2");
  const partes = [linha1, linha2, cepFormatado ? `CEP ${cepFormatado}` : null].filter(Boolean);
  return partes.length > 0 ? partes.join(" — ") : null;
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
