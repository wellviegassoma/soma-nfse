// Retenções de uma nota (o que o tomador desconta e recolhe no lugar do
// prestador) — mesma conta na prévia do formulário e na action de emissão,
// pra o líquido mostrado ser exatamente o que vai na nota.

export type RetencoesNota = {
  issRetido: boolean;
  /** % do ISS — obrigatória quando retido no Simples (vai no pAliq). */
  aliquotaIss: number | null;
  irrfPct: number | null;
  /** PIS + COFINS + CSLL retidos (ex.: 4,65). */
  csrfPct: number | null;
  inssPct: number | null;
};

export type ValoresRetidos = {
  iss: number;
  irrf: number;
  csrf: number;
  inss: number;
  total: number;
  liquido: number;
};

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcularRetencoes(valor: number, r: RetencoesNota): ValoresRetidos {
  const v = Number.isFinite(valor) && valor > 0 ? valor : 0;
  const pct = (p: number | null) => (p != null && p > 0 ? round2((v * p) / 100) : 0);
  const iss = r.issRetido ? pct(r.aliquotaIss) : 0;
  const irrf = pct(r.irrfPct);
  const csrf = pct(r.csrfPct);
  const inss = pct(r.inssPct);
  const total = round2(iss + irrf + csrf + inss);
  return { iss, irrf, csrf, inss, total, liquido: round2(v - total) };
}

/** Só PJ (CNPJ) retém tributo na fonte — pessoa física não. */
export function tomadorRetem(documento: string | null | undefined): boolean {
  return (documento ?? "").replace(/\D/g, "").length === 14;
}

export function lerPercentual(v: FormDataEntryValue | string | null | undefined): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
