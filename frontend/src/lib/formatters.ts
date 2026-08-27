export type StatusTone = "danger" | "warning" | "success" | "neutral";

export const STATUS_PILL_CLASSES: Record<StatusTone, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  neutral: "bg-surface-muted text-foreground/50",
};

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
