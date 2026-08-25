function raizCnpj(cnpj: string | null | undefined): string | null {
  const d = (cnpj ?? "").replace(/\D/g, "");
  return d.length >= 8 ? d.slice(0, 8) : null;
}

/**
 * 'saida'    -> a empresa é a prestadora (emitiu a nota para um cliente)
 * 'entrada'  -> a empresa é a tomadora (recebeu a nota de um fornecedor)
 * 'indefinida' -> raiz de CNPJ não bateu com nenhum dos dois lados
 * (mesma lógica de relatorio.py:_classificar_direcao, pro filtro/contagem
 * no lado do frontend não divergir do relatório PDF gerado no backend).
 */
export function classificarDirecao(
  prestadorCnpj: string | null | undefined,
  tomadorCnpj: string | null | undefined,
  cnpjEmpresa: string | null | undefined,
): "saida" | "entrada" | "indefinida" {
  const raizEmpresa = raizCnpj(cnpjEmpresa);
  if (!raizEmpresa) return "indefinida";
  if (raizCnpj(prestadorCnpj) === raizEmpresa) return "saida";
  if (raizCnpj(tomadorCnpj) === raizEmpresa) return "entrada";
  return "indefinida";
}
