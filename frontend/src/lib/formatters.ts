const formatadorMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatarMoeda(valor: number): string {
  return formatadorMoeda.format(valor);
}

/** Recebe uma fração (0.05) e formata como percentual (5,0%). */
export function formatarPercentual(fracao: number, casasDecimais = 1): string {
  return `${(fracao * 100).toFixed(casasDecimais).replace(".", ",")}%`;
}

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

export function formatarCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11) return cpf;
  return digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

/** Checksum dos dois dígitos verificadores do CPF (algoritmo oficial). */
export function isCpfValido(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;

  const calcularDigito = (base: string, pesoInicial: number): number => {
    const soma = base
      .split("")
      .reduce((acc, digito, i) => acc + Number(digito) * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  const digito1 = calcularDigito(digitos.slice(0, 9), 10);
  const digito2 = calcularDigito(digitos.slice(0, 9) + digito1, 11);
  return digitos === digitos.slice(0, 9) + String(digito1) + String(digito2);
}

type EmpresaComDocumento = { cnpj: string | null; cpf: string | null };

/** CNPJ ou CPF, o que estiver preenchido — nunca ambos (ver check
 * constraint `companies_documento_por_tipo`). */
export function documentoEmpresa(empresa: EmpresaComDocumento): string | null {
  return empresa.cnpj || empresa.cpf || null;
}

export function formatarDocumentoEmpresa(
  empresa: EmpresaComDocumento,
): { label: "CNPJ" | "CPF"; valor: string } | null {
  if (empresa.cnpj) return { label: "CNPJ", valor: formatarCnpj(empresa.cnpj)! };
  if (empresa.cpf) return { label: "CPF", valor: formatarCpf(empresa.cpf)! };
  return null;
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
