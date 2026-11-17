// Pagamentos federais (DAS, DARF) lidos do Integra Contador —
// PAGTOWEB.PAGAMENTOS71. Sem dependência de servidor (testável).
//
// Resposta: `dados` é uma string JSON com a lista de DocumentoArrecadacaoIC
// (numeroDocumento, tipo{codigo,descricao,descricaoAbreviada},
// periodoApuracao, dataArrecadacao, dataVencimento, receitaPrincipal{codigo,
// descricao}, valorTotal, valorPrincipal, valorMulta, valorJuros,
// desmembramentos[]). Formatos de data não detalhados na documentação —
// lidos de forma tolerante (ISO com hora, AAAA-MM-DD, AAAAMM, DD/MM/AAAA).

export type PagamentoFederal = {
  numeroDocumento: string;
  tipo: string;
  periodoApuracao: string | null; // "YYYY-MM"
  dataArrecadacao: string | null; // "YYYY-MM-DD"
  dataVencimento: string | null; // "YYYY-MM-DD"
  receitaCodigo: string | null;
  receitaDescricao: string | null;
  valorTotal: number;
  valorPrincipal: number | null;
  valorMulta: number | null;
  valorJuros: number | null;
  desmembramentos: { receitaCodigo: string | null; receitaDescricao: string | null; valorTotal: number }[];
};

type Bruto = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function numero(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
}

/** Datas da Serpro em vários formatos → "YYYY-MM-DD". */
export function normalizarData(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/** Período de apuração → "YYYY-MM". */
export function normalizarPeriodo(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}`;
  m = s.match(/^(\d{2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  return null;
}

function receita(v: unknown): { codigo: string | null; descricao: string | null } {
  const r = (v ?? {}) as Bruto;
  return { codigo: texto(r.codigo), descricao: texto(r.descricao) };
}

/** `resposta.dados` (string JSON ou já objeto) → lista de documentos. */
export function lerPagamentos(dados: unknown): PagamentoFederal[] {
  let d: unknown = dados;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return [];
    }
  }
  let lista: unknown[] = [];
  if (Array.isArray(d)) lista = d;
  else if (d && typeof d === "object") {
    const arr = Object.values(d as Bruto).find(Array.isArray) as unknown[] | undefined;
    lista = arr ?? [d];
  }
  return lista
    .filter((x): x is Bruto => !!x && typeof x === "object" && texto((x as Bruto).numeroDocumento) != null)
    .map((x) => {
      const tipo = (x.tipo ?? {}) as Bruto;
      const r = receita(x.receitaPrincipal);
      return {
        numeroDocumento: texto(x.numeroDocumento)!,
        tipo: abreviarTipo(texto(tipo.descricaoAbreviada) ?? texto(tipo.descricao) ?? texto(tipo.codigo) ?? ""),
        periodoApuracao: normalizarPeriodo(x.periodoApuracao),
        dataArrecadacao: normalizarData(x.dataArrecadacao),
        dataVencimento: normalizarData(x.dataVencimento),
        receitaCodigo: r.codigo,
        receitaDescricao: r.descricao,
        valorTotal: numero(x.valorTotal) ?? 0,
        valorPrincipal: numero(x.valorPrincipal),
        valorMulta: numero(x.valorMulta),
        valorJuros: numero(x.valorJuros),
        desmembramentos: (Array.isArray(x.desmembramentos) ? (x.desmembramentos as Bruto[]) : []).map((dm) => {
          const rr = receita(dm.receitaPrincipal);
          return { receitaCodigo: rr.codigo, receitaDescricao: rr.descricao, valorTotal: numero(dm.valorTotal) ?? 0 };
        }),
      };
    });
}

/**
 * A Receita devolve o tipo por extenso (visto em 17/11/2026: "DOCUMENTO DE
 * ARRECADAÇÃO DO SIMPLES NACIONAL", "... DE RECEITAS FEDERAIS") — vira a sigla.
 */
export function abreviarTipo(tipo: string): string {
  if (/SIMPLES NACIONAL/i.test(tipo)) return /MEI/i.test(tipo) ? "DAS-MEI" : "DAS";
  if (/RECEITAS FEDERAIS/i.test(tipo)) return "DARF";
  if (/PREVIDENCI/i.test(tipo)) return "GPS";
  return tipo;
}

/** DAS do Simples: sigla DAS ou receita 3333 (Simples Nacional). */
export function ehDas(p: PagamentoFederal): boolean {
  return /^DAS\b/i.test(p.tipo) || /simples nacional/i.test(p.tipo) || p.receitaCodigo === "3333";
}

/** Procura recursivamente o PDF (base64 começando com "JVBER") na resposta. */
export function acharPdfBase64(v: unknown, profundidade = 0): string | null {
  if (profundidade > 6 || v == null) return null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("JVBER")) return s;
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return acharPdfBase64(JSON.parse(s), profundidade + 1);
      } catch {
        return null;
      }
    }
    return null;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const r = acharPdfBase64(x, profundidade + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "object") {
    for (const x of Object.values(v as Bruto)) {
      const r = acharPdfBase64(x, profundidade + 1);
      if (r) return r;
    }
  }
  return null;
}

/** Janela de busca para a competência: do 1º dia do mês seguinte até hoje, no máximo 6 meses. */
export function janelaDaCompetencia(competencia: string, hoje: string): { dataInicial: string; dataFinal: string } {
  const [a, m] = competencia.split("-").map(Number);
  const dataInicial = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  const limite = new Date(Date.UTC(a, m + 6, 0)).toISOString().slice(0, 10);
  const fim = hoje < limite ? hoje : limite;
  return { dataInicial, dataFinal: fim < dataInicial ? dataInicial : fim };
}
