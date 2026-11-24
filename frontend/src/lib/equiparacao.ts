// Equiparação hospitalar no Lucro Presumido (8% IRPJ / 12% CSLL) — regra de
// classificação nota a nota pela descrição. Montada em 24/11/2026 a partir do
// que a equipe declarou no 3º trimestre/2026 (bateu 97–100% em Espaço Vitae,
// COMAF e RRAD) + Lei 9.249/95 art. 15 §1º III "a", IN RFB 1.700/2017 art. 33
// e STJ REsp 1.116.399 (consulta simples não entra).
// Função pura (sem banco): o Newton junta isso com as decisões aprendidas e o
// padrão da empresa (lib/newton.ts).

export type SugestaoEquiparacao = "SIM" | "NAO" | "DUVIDA";

const NAO: [RegExp, string][] = [
  [/\bconsulta|01[- ]?consulta|\bretorno\b/i, "consulta (STJ: consulta simples não entra)"],
  [/curso|aula|treinamento|palestra|coordena[cç]/i, "ensino/coordenação, não é serviço hospitalar"],
  [/nutri[cç]|psicolog|prepara[cç][aã]o f[ií]sica|personal|avalia[cç][aã]o biomec|dinamometr/i, "atividade sem caráter hospitalar"],
  [/parceria comercial|aluguel|loca[cç][aã]o|subloca/i, "receita comercial/locação"],
  [/restaura[cç]|profilax|limpeza|clareamento/i, "odontologia clínica, não hospitalar"],
];

const SIM: [RegExp, string][] = [
  [/cirurg|centro cir[uú]rgico|interna[cç]/i, "cirurgia/procedimento cirúrgico"],
  [/procedimento|pun[cç][aã]o|infiltra|bloqueio|bi[oó]psia|\bdiu\b|inser[cç][aã]o|aplica[cç]|\bprp\b|plasma rico|viscossuplement|[aá]cido hialur/i, "procedimento (auxílio diagnóstico e terapia)"],
  [/ultrass|\busg\b|ecocardio|doppler|raio[- ]?x|radiogra|tomogra|resson|mamogra|densitom|eletrocardio|holter|exame|endoscop|colonoscop|laudo/i, "exame de imagem/diagnóstico"],
  [/fisioterap|sess[aãõo]es? de|imunoestim|infus|quimio|terapia/i, "terapia"],
  [/\bsadt\b|bucomaxil|buco-maxilo/i, "SADT/cirurgia buco-maxilo-facial"],
];

/** Classificação só pela descrição da nota (sem histórico). */
export function regraEquiparacao(descricao: string | null | undefined): { sugestao: SugestaoEquiparacao; motivo: string } {
  const d = descricao ?? "";
  const cirurgia = /cirurg|procedimento cir/i.test(d);
  for (const [re, motivo] of NAO) if (re.test(d) && !cirurgia) return { sugestao: "NAO", motivo };
  for (const [re, motivo] of SIM) if (re.test(d)) return { sugestao: "SIM", motivo };
  return { sugestao: "DUVIDA", motivo: "descrição genérica — decidir" };
}

/** Chave para aprender: descrição sem números, datas, pontuação e acentos. */
export function chaveDescricao(descricao: string | null | undefined): string {
  return (descricao ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/\b(crm|rqe|tuss|cpf|cnpj|dr|dra|sr|sra)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

// Natureza jurídica que NÃO pode usar a equiparação (sociedade simples, pura
// ou limitada; EIRELI simples). A lei exige sociedade empresária.
export const NATUREZAS_SEM_EQUIPARACAO: Record<string, string> = {
  "2232": "Sociedade Simples Pura",
  "2240": "Sociedade Simples Limitada",
  "2313": "EIRELI de natureza simples",
};
