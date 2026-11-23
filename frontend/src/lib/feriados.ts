// Feriados nacionais (fixos + móveis pela Páscoa) para antecipar prazos que
// caem em dia sem expediente. Carnaval (segunda e terça) entra porque bancos
// e repartições não funcionam. Feriados municipais/estaduais não entram.

function pascoa(ano: number): Date {
  // Algoritmo de Meeus/Jones/Butcher (calendário gregoriano).
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const cache = new Map<number, Set<string>>();

export function feriadosNacionais(ano: number): Set<string> {
  let s = cache.get(ano);
  if (s) return s;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const mais = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const p = pascoa(ano);
  s = new Set([
    `${ano}-01-01`,
    `${ano}-04-21`,
    `${ano}-05-01`,
    `${ano}-09-07`,
    `${ano}-10-12`,
    `${ano}-11-02`,
    `${ano}-11-15`,
    `${ano}-11-20`,
    `${ano}-12-25`,
    iso(mais(p, -48)), // Carnaval (segunda)
    iso(mais(p, -47)), // Carnaval (terça)
    iso(mais(p, -2)), // Sexta-feira Santa
    iso(mais(p, 60)), // Corpus Christi
  ]);
  cache.set(ano, s);
  return s;
}

export function diaUtil(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !feriadosNacionais(d.getUTCFullYear()).has(iso);
}

/** O próprio dia, se útil; senão o dia útil anterior. */
export function diaUtilAnterior(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  for (let i = 0; i < 10; i++) {
    const s = d.toISOString().slice(0, 10);
    if (diaUtil(s)) return s;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return iso;
}
