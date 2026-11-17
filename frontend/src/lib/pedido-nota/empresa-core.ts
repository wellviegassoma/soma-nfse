// Regras puras para achar a empresa de um pedido de nota (sem banco —
// testável isolado). Quem consulta o Supabase é lib/pedido-nota/empresa.ts.

export type EmpresaRef = { id: string; cnpj: string | null; cpf: string | null; legalName: string; tradeName: string | null };

// CNPJ (14) ou CPF (11), formatado ou não.
const RE_DOC = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})\b/g;

/** CPF/CNPJ escritos na dica do "#nota" (texto original + só dígitos). */
export function documentosNaDica(dica: string | null): { texto: string; digitos: string }[] {
  if (!dica) return [];
  return [...dica.matchAll(RE_DOC)].map((m) => ({ texto: m[0], digitos: m[0].replace(/\D/g, "") }));
}

/**
 * O primeiro documento da dica que é de uma empresa cadastrada (CNPJ ou,
 * para cliente pessoa física, CPF) identifica a empresa e sai da dica.
 * Documento que não é de empresa fica na dica: pode ser o do TOMADOR
 * ("#nota 450 pro CPF 123...") e ajuda a IA.
 */
export function empresaPelaDica(
  dica: string | null,
  empresas: EmpresaRef[],
): { companyId: string | null; resto: string | null; documentoSemEmpresa: string | null } {
  const docs = documentosNaDica(dica);
  for (const d of docs) {
    const e = empresas.find((x) => (d.digitos.length === 14 ? digitos(x.cnpj) : digitos(x.cpf)) === d.digitos);
    if (e) {
      const resto = (dica ?? "").replace(d.texto, " ").replace(/\s+/g, " ").trim();
      return { companyId: e.id, resto: resto || null, documentoSemEmpresa: null };
    }
  }
  return { companyId: null, resto: dica, documentoSemEmpresa: docs[0]?.digitos ?? null };
}

export function digitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Palavras que não distinguem uma empresa de outra: natureza jurídica,
// preposições, títulos ("Dr." no nome do grupo) e termos de ramo/serviço que
// aparecem só de um dos lados (no cadastro: "PSD", "Livro Caixa",
// "Serviços Médicos"; no grupo: "Dr.", "Clinic"). Medido em 16/11/2026 nos
// 619 grupos "SOMA + nome" do Digisac.
const IGNORAR = new Set([
  "ltda", "me", "epp", "eireli", "sa", "slu", "ss", "sociedade", "simples", "limitada", "unipessoal", "cia", "companhia",
  "de", "da", "do", "das", "dos", "e", "x", "com", "em", "a", "o",
  "dr", "dra", "doutor", "doutora", "prof", "profa",
  "servicos", "servico", "serv", "comercio", "industria", "empresa", "grupo", "brasil",
  "clinica", "clinic", "consultorio", "medica", "medico", "medicos", "medicina", "odontologia", "odontologica", "odonto",
  "saude", "instituto", "cei", "psd", "livro", "caixa", "pf", "mei", "representacoes", "producoes",
  "soma", "contabilidade", "contabil", "integrada",
]);

export function tokens(t: string | null | undefined): string[] {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 2 && !IGNORAR.has(w));
}

/** "SOMA + Clínica Exemplo" → "Clínica Exemplo" (padrão dos grupos da SOMA). */
export function nomeSemPrefixoSoma(nome: string): string {
  return nome.replace(/^\s*soma\b[\s+\-–—x/!:|()]*/i, "").trim();
}

export type ResultadoNome = {
  /** Mesmas palavras significativas (ignorando título, natureza jurídica e ramo). */
  exatas: string[];
  /** Todas as palavras de um lado estão no outro, com 2+ palavras em comum. */
  fortes: string[];
  /** As mais parecidas (para sugerir no painel), da mais para a menos. */
  candidatas: string[];
};

function parecido(a: Set<string>, b: Set<string>) {
  const comum = [...a].filter((w) => b.has(w)).length;
  const uniao = new Set([...a, ...b]).size || 1;
  return { comum, jaccard: comum / uniao, aDentroDeB: comum === a.size, bDentroDeA: comum === b.size };
}

/**
 * Empresas que correspondem a um nome citado na conversa ("Empresa
 * Rcbastos" → RCBASTOS SPORTS MEDICINE LTDA): o CPF/CNPJ citado, ou todas as
 * palavras significativas do trecho dentro do nome da empresa (o cliente
 * costuma abreviar o nome). Exige uma palavra com 4+ letras.
 */
export function empresasPorTrecho(trecho: string, empresas: EmpresaRef[]): string[] {
  const doc = trecho.replace(/\D/g, "");
  if (doc.length === 11 || doc.length === 14) {
    const porDoc = empresas.filter((e) => digitos(doc.length === 14 ? e.cnpj : e.cpf) === doc).map((e) => e.id);
    if (porDoc.length) return porDoc;
  }
  const t = tokens(trecho).filter((w) => !/^\d+$/.test(w));
  if (!t.length || !t.some((w) => w.length >= 4)) return [];
  return empresas
    .filter((e) =>
      [e.tradeName, e.legalName].some((nome) => {
        const c = new Set(tokens(nome));
        return c.size > 0 && t.every((w) => c.has(w));
      }),
    )
    .map((e) => e.id);
}

/**
 * Empresas pelo nome do grupo/contato do Digisac. Exata = automática (é o
 * padrão "SOMA + nome do sistema"); forte = provável, vai com alerta;
 * candidatas = só sugestão no painel.
 */
export function empresasPorNome(nomeContato: string, empresas: EmpresaRef[]): ResultadoNome {
  const g = new Set(tokens(nomeSemPrefixoSoma(nomeContato)));
  const vazio = { exatas: [], fortes: [], candidatas: [] };
  if (!g.size || ![...g].some((w) => w.length >= 4)) return vazio;

  const exatas: string[] = [];
  const fortes: string[] = [];
  const pontuadas: { id: string; j: number }[] = [];
  for (const e of empresas) {
    let melhor = 0;
    let exata = false;
    let forte = false;
    for (const nome of [e.tradeName, e.legalName]) {
      const c = new Set(tokens(nome));
      if (!c.size) continue;
      const p = parecido(g, c);
      melhor = Math.max(melhor, p.jaccard);
      if (p.jaccard === 1) exata = true;
      else if ((p.aDentroDeB || p.bDentroDeA) && p.comum >= 2) forte = true;
    }
    if (exata) exatas.push(e.id);
    else if (forte) fortes.push(e.id);
    if (melhor >= 0.34) pontuadas.push({ id: e.id, j: melhor });
  }
  const candidatas = pontuadas.sort((a, b) => b.j - a.j).slice(0, 8).map((x) => x.id);
  return { exatas, fortes, candidatas };
}
