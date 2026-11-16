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

// Palavras que não identificam empresa nenhuma (natureza jurídica, ramo
// genérico, nome do próprio escritório nos grupos "SOMA x Cliente").
const GENERICAS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "slu", "ss", "sociedade", "simples", "limitada", "unipessoal",
  "servicos", "servico", "comercio", "industria", "empresa", "grupo", "cia", "companhia",
  "clinica", "consultorio", "medica", "medicos", "odontologia", "odontologica", "saude",
  "soma", "contabilidade", "contabil", "integrada", "financeiro", "fiscal", "dp", "atendimento",
  "de", "da", "do", "das", "dos", "e", "x", "com", "brasil",
]);

export function tokens(t: string | null | undefined): string[] {
  return (t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !GENERICAS.has(w));
}

/**
 * Empresas cujo nome (fantasia ou razão social) aparece inteiro no nome do
 * grupo/contato: todas as palavras significativas de um dos nomes da empresa
 * estão no nome do contato. Exige ao menos uma palavra significativa com 4+
 * letras para não casar por sigla curta.
 */
export function empresasPorNome(nomeContato: string, empresas: EmpresaRef[]): string[] {
  const doContato = new Set(tokens(nomeContato));
  if (!doContato.size) return [];
  const achadas: string[] = [];
  for (const e of empresas) {
    const casou = [e.tradeName, e.legalName].some((nome) => {
      const t = tokens(nome);
      return t.some((w) => w.length >= 4) && t.every((w) => doContato.has(w));
    });
    if (casou) achadas.push(e.id);
  }
  return achadas;
}
