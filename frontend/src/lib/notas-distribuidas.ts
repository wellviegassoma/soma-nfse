function soDigitos(documento: string | null | undefined): string | null {
  const d = (documento ?? "").replace(/\D/g, "");
  return d.length >= 11 ? d : null;
}

/**
 * 'saida'    -> a empresa é a prestadora (emitiu a nota para um cliente)
 * 'entrada'  -> a empresa é a tomadora (recebeu a nota de um fornecedor)
 * 'indefinida' -> o documento da empresa não bateu com nenhum dos dois lados
 *
 * Compara o CNPJ inteiro, não só a raiz: matriz e filial cadastradas
 * separadas (FVS 183/184, Dela 266/293) recebem do ADN as notas uma da
 * outra, e pela raiz a filial contava o faturamento da matriz como seu
 * (ISS de cada inscrição saía errado). O relatório PDF do backend
 * (relatorio.py) segue por raiz de propósito — ele resume o grupo.
 */
export function classificarDirecao(
  prestadorCnpj: string | null | undefined,
  tomadorCnpj: string | null | undefined,
  cnpjEmpresa: string | null | undefined,
): "saida" | "entrada" | "indefinida" {
  const documentoEmpresa = soDigitos(cnpjEmpresa);
  if (!documentoEmpresa) return "indefinida";
  if (soDigitos(prestadorCnpj) === documentoEmpresa) return "saida";
  if (soDigitos(tomadorCnpj) === documentoEmpresa) return "entrada";
  return "indefinida";
}
