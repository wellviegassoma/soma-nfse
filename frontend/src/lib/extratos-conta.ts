// Comparação de número de conta bancária (client-safe).

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Mesmo número de conta, tolerando dígito verificador ausente de um dos lados. */
export function mesmaConta(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = digitos(a);
  const y = digitos(b);
  if (x.length < 4 || y.length < 4) return false;
  return x === y || x.slice(0, -1) === y || y.slice(0, -1) === x;
}
