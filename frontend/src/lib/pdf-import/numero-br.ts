export function parseNumeroBr(texto: string): number {
  return Number(texto.replace(/\./g, "").replace(",", "."));
}
