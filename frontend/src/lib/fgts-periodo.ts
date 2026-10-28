// Competência das guias de FGTS no formato da Infosimples (AAAAMM). Fica
// fora de fgts-infosimples.ts (server-only) porque a tela da Central
// também usa — pra montar o seletor e a lista de "últimos N meses".

// O mês anterior ao corrente (horário de Brasília) — é a guia que vence no
// dia 20 do mês corrente, e também o padrão da própria Infosimples quando
// `periodo` não é informado.
export function periodoFgtsPadrao(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(agora)
    .split("-")
    .map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}${String(anterior.mes).padStart(2, "0")}`;
}

export function periodoValido(periodo: string): boolean {
  if (!/^\d{6}$/.test(periodo)) return false;
  const mes = Number(periodo.slice(4, 6));
  return mes >= 1 && mes <= 12;
}

// `quantidade` competências terminando em `ultimo` (inclusive), da mais
// recente pra mais antiga: ("202609", 3) → ["202609", "202608", "202607"].
export function periodosAte(ultimo: string, quantidade: number): string[] {
  let ano = Number(ultimo.slice(0, 4));
  let mes = Number(ultimo.slice(4, 6));
  const periodos: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    periodos.push(`${ano}${String(mes).padStart(2, "0")}`);
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
  }
  return periodos;
}

// "202609" → "09/2026"
export function periodoLegivel(periodo: string): string {
  return `${periodo.slice(4, 6)}/${periodo.slice(0, 4)}`;
}
