// Central da Reinf — leitura das retenções de uma NFS-e RECEBIDA (XML do
// padrão nacional) e enquadramento no evento da EFD-Reinf.
//
// Sem dependência de servidor: testável com node (scripts de conferência).
//
// Regras do XML (NT SE/CGNFS-e 007/2026, em vigor desde 09/02/2026):
//  - vRetCSLL passou a ser a SOMA de PIS + COFINS + CSLL retidos, e
//    tpRetPisCofins diz quais foram retidos (0..9). vPis/vCofins são o
//    débito próprio do prestador — NÃO são retenção.
//  - Os códigos 1 e 2 são do layout antigo: 1 = PIS/COFINS retidos (aí
//    vPis/vCofins são os retidos e vRetCSLL é só a CSLL); 2 = não retidos.
//  - Visto em produção: nota sem tpRetPisCofins com vRetCSLL = 4,65% do
//    valor (Diego Campos, out/26) — o emissor somou as três sem dizer.
//    Sem o tipo, deduzimos a combinação pela alíquota efetiva.
//  - O total retido da nota vem em NFSe/infNFSe/valores/vTotalRet: usado
//    para conferir a soma.
// A Reinf exige PIS, COFINS e CSLL separados, então o total é rateado
// pelas alíquotas da retenção (Lei 10.833/2003, art. 31): 0,65 / 3 / 1.

export type Tributo = "irrf" | "pis" | "cofins" | "csll" | "cp" | "iss";
export type ValoresRetidos = Record<Tributo, number>;

export type EventoReinf = "R-4020" | "R-4010" | "R-2010" | "ISS";

export const EVENTOS: Record<EventoReinf, { titulo: string; descricao: string }> = {
  "R-4020": {
    titulo: "R-4020",
    descricao: "IRRF, PIS, COFINS e CSLL retidos de pessoa jurídica",
  },
  "R-4010": { titulo: "R-4010", descricao: "IRRF retido de pessoa física" },
  "R-2010": { titulo: "R-2010", descricao: "INSS (CP) retido — cessão de mão de obra/empreitada" },
  ISS: { titulo: "ISS retido", descricao: "Municipal — não vai para a Reinf" },
};

export type LeituraRetencoes = {
  valores: ValoresRetidos;
  total: number;
  valorServico: number;
  /** vTotalRet da nota (null quando a nota não informa). */
  totalNota: number | null;
  cTribNac: string | null;
  tpRetPisCofins: string | null;
  /** Prestador optante pelo Simples Nacional (opSimpNac 2 = MEI, 3 = ME/EPP). */
  prestadorSimples: boolean;
  alertas: string[];
};

const ALIQ = { pis: 0.65, cofins: 3, csll: 1 } as const;
type Contrib = keyof typeof ALIQ;

// Quais contribuições cada tpRetPisCofins (NT 007) diz que foram retidas.
const RETIDAS_POR_TIPO: Record<string, Contrib[]> = {
  "0": [],
  "3": ["pis", "cofins", "csll"],
  "4": ["pis", "cofins"],
  "5": ["pis"],
  "6": ["cofins"],
  "7": ["cofins", "csll"],
  "8": ["csll"],
  "9": ["pis", "csll"],
};

// Combinações possíveis, para deduzir pela alíquota quando a nota não diz.
const COMBINACOES: Contrib[][] = [
  ["pis", "cofins", "csll"],
  ["pis", "cofins"],
  ["csll"],
  ["cofins", "csll"],
  ["pis", "csll"],
  ["pis"],
  ["cofins"],
];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function tag(xml: string, nome: string, dentroDe?: string): string | null {
  let trecho = xml;
  if (dentroDe) {
    const i = xml.indexOf(`<${dentroDe}>`);
    if (i < 0) return null;
    const f = xml.indexOf(`</${dentroDe}>`, i);
    trecho = xml.slice(i, f < 0 ? undefined : f);
  }
  const m = trecho.match(new RegExp(`<${nome}>([^<]*)</${nome}>`));
  return m ? m[1].trim() : null;
}

function num(v: string | null): number {
  const n = v == null ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Rateia `total` entre as contribuições pelas alíquotas; a diferença de centavo fica na maior. */
export function ratear(total: number, retidas: Contrib[]): Record<Contrib, number> {
  const r: Record<Contrib, number> = { pis: 0, cofins: 0, csll: 0 };
  if (!retidas.length || total <= 0) return r;
  const soma = retidas.reduce((a, c) => a + ALIQ[c], 0);
  for (const c of retidas) r[c] = round2((total * ALIQ[c]) / soma);
  const maior = retidas.reduce((a, c) => (ALIQ[c] > ALIQ[a] ? c : a), retidas[0]);
  r[maior] = round2(r[maior] + total - retidas.reduce((a, c) => a + r[c], 0));
  return r;
}

/** Combinação cuja alíquota somada fica mais perto de total/base (tolerância de 0,15 ponto). */
export function deduzirRetidas(total: number, base: number): Contrib[] | null {
  if (total <= 0 || base <= 0) return null;
  const pct = (total / base) * 100;
  let melhor: Contrib[] | null = null;
  let dif = Infinity;
  for (const c of COMBINACOES) {
    const d = Math.abs(c.reduce((a, x) => a + ALIQ[x], 0) - pct);
    if (d < dif) {
      dif = d;
      melhor = c;
    }
  }
  return dif <= 0.15 ? melhor : null;
}

export function lerRetencoes(xml: string): LeituraRetencoes {
  const alertas: string[] = [];
  // Os valores declarados ficam no DPS; o total apurado, no infNFSe.
  const dps = (() => {
    const i = xml.indexOf("<infDPS");
    return i < 0 ? xml : xml.slice(i);
  })();
  const valorServico = num(tag(dps, "vServ"));
  const tp = tag(dps, "tpRetPisCofins");
  const irrf = round2(num(tag(dps, "vRetIRRF")));
  const cp = round2(num(tag(dps, "vRetCP")));
  const vRetCsll = round2(num(tag(dps, "vRetCSLL")));
  const vPis = round2(num(tag(dps, "vPis")));
  const vCofins = round2(num(tag(dps, "vCofins")));

  // ISS: só quando a nota diz que o tomador retém (tpRetISSQN 2). O valor
  // apurado está no grupo valores do infNFSe (antes do DPS).
  const issRetido = tag(dps, "tpRetISSQN") === "2";
  const antesDoDps = xml.slice(0, Math.max(0, xml.indexOf("<DPS")));
  const iss = issRetido ? round2(num(tag(antesDoDps, "vISSQN")) || num(tag(dps, "vISSQN"))) : 0;

  let contrib: Record<Contrib, number> = { pis: 0, cofins: 0, csll: 0 };
  if (tp === "1") {
    // Layout antigo: PIS/COFINS retidos nos próprios campos, CSLL à parte.
    contrib = { pis: vPis, cofins: vCofins, csll: vRetCsll };
  } else if (tp && RETIDAS_POR_TIPO[tp]) {
    const retidas = RETIDAS_POR_TIPO[tp];
    if (!retidas.length && vRetCsll > 0) {
      const deduzidas = deduzirRetidas(vRetCsll, valorServico) ?? ["pis", "cofins", "csll"];
      alertas.push(`A nota diz "PIS/COFINS/CSLL não retidos", mas traz R$ ${vRetCsll.toFixed(2)} retidos — confira.`);
      contrib = ratear(vRetCsll, deduzidas);
    } else {
      contrib = ratear(vRetCsll, retidas);
    }
  } else if (vRetCsll > 0) {
    // Sem tipo (ou tipo 2, "PIS/COFINS não retido", do layout antigo).
    if (tp === "2") {
      contrib = { pis: 0, cofins: 0, csll: vRetCsll };
    } else {
      const deduzidas = deduzirRetidas(vRetCsll, valorServico);
      if (deduzidas) {
        contrib = ratear(vRetCsll, deduzidas);
        if (deduzidas.length > 1) {
          alertas.push(
            `A nota não diz quais contribuições foram retidas; pela alíquota (${((vRetCsll / valorServico) * 100).toFixed(2)}%) foram ${deduzidas.map((c) => c.toUpperCase()).join(" + ")}.`,
          );
        }
      } else {
        contrib = { pis: 0, cofins: 0, csll: vRetCsll };
        alertas.push("Valor de CSLL retida fora das alíquotas usuais — confira se inclui PIS/COFINS.");
      }
    }
  }

  const valores: ValoresRetidos = { irrf, cp, iss, ...contrib };
  const total = round2(Object.values(valores).reduce((a, b) => a + b, 0));
  const totalNotaTxt = tag(antesDoDps, "vTotalRet");
  const totalNota = totalNotaTxt == null ? null : round2(num(totalNotaTxt));
  if (totalNota != null) {
    // vTotalRet (calculado pelo Ambiente Nacional) às vezes inclui o ISS
    // retido e às vezes soma vPis/vCofins mesmo quando são só o débito
    // próprio (visto em out/26: Constantino, MR Laboratório). Só alerta
    // quando não bate com nenhuma dessas formas.
    const debitoProprio = tp === "1" ? 0 : vPis + vCofins;
    const formas = [total, total - iss, total + debitoProprio, total - iss + debitoProprio].map(round2);
    if (formas.every((f) => Math.abs(totalNota - f) > 0.05)) {
      alertas.push(`Total retido informado na nota (R$ ${totalNota.toFixed(2)}) difere da soma lida (R$ ${total.toFixed(2)}).`);
    }
  }

  const opSimp = (xml.match(/<prest>[\s\S]*?<opSimpNac>(\d)<\/opSimpNac>/) ?? [])[1];
  const prestadorSimples = opSimp === "2" || opSimp === "3";
  if (prestadorSimples && irrf + contrib.pis + contrib.cofins + contrib.csll > 0) {
    alertas.push(
      "Prestador do Simples Nacional: retenção de IRRF/PIS/COFINS/CSLL normalmente é dispensada — confira se foi mesmo descontada.",
    );
  }

  return {
    valores,
    total,
    valorServico,
    totalNota,
    cTribNac: tag(dps, "cTribNac"),
    tpRetPisCofins: tp,
    prestadorSimples,
    alertas,
  };
}

/** Documento só com dígitos: 11 = pessoa física, 14 = jurídica. */
export function prestadorPessoaFisica(documento: string | null | undefined): boolean {
  return (documento ?? "").replace(/\D/g, "").length === 11;
}

/** Em quais eventos a nota entra, com o valor de cada tributo. */
export function eventosDaNota(v: ValoresRetidos, pessoaFisica: boolean): { evento: EventoReinf; valores: Partial<ValoresRetidos>; total: number }[] {
  const out: { evento: EventoReinf; valores: Partial<ValoresRetidos>; total: number }[] = [];
  const federais = { irrf: v.irrf, pis: v.pis, cofins: v.cofins, csll: v.csll };
  const somaFed = round2(v.irrf + v.pis + v.cofins + v.csll);
  if (somaFed > 0) out.push({ evento: pessoaFisica ? "R-4010" : "R-4020", valores: federais, total: somaFed });
  if (v.cp > 0) out.push({ evento: "R-2010", valores: { cp: v.cp }, total: v.cp });
  if (v.iss > 0) out.push({ evento: "ISS", valores: { iss: v.iss }, total: v.iss });
  return out;
}

// --- Natureza do rendimento (Tabela 01 do Anexo I da EFD-Reinf) ----------

export const NATUREZAS: Record<string, string> = {
  "10002": "Trabalho sem vínculo empregatício (PF)",
  "15001": "Cooperativas de trabalho",
  "15002": "Associações de profissionais",
  "15003": "Administração de bens ou negócios",
  "15004": "Advocacia",
  "15005": "Análise clínica laboratorial",
  "15006": "Análises técnicas",
  "15007": "Arquitetura",
  "15008": "Assessoria e consultoria técnica",
  "15009": "Assistência social",
  "15010": "Auditoria",
  "15011": "Avaliação e perícia",
  "15012": "Biologia e biomedicina",
  "15013": "Cálculo em geral",
  "15014": "Consultoria",
  "15015": "Contabilidade",
  "15016": "Desenho técnico",
  "15017": "Economia",
  "15018": "Elaboração de projetos",
  "15019": "Engenharia (exceto obras)",
  "15020": "Ensino e treinamento",
  "15021": "Estatística",
  "15022": "Fisioterapia",
  "15023": "Fonoaudiologia",
  "15024": "Geologia",
  "15025": "Leilão",
  "15026": "Medicina (exceto hospital, pronto-socorro etc.)",
  "15027": "Nutricionismo e dietética",
  "15028": "Odontologia",
  "15029": "Organização de feiras, congressos e eventos",
  "15030": "Pesquisa em geral",
  "15031": "Planejamento",
  "15032": "Programação",
  "15033": "Prótese",
  "15034": "Psicologia e psicanálise",
  "15035": "Química",
  "15036": "Radiologia e radioterapia",
  "15037": "Relações públicas",
  "15038": "Despachante",
  "15039": "Terapêutica ocupacional",
  "15040": "Tradução ou interpretação comercial",
  "15041": "Urbanismo",
  "15042": "Veterinária",
  "15043": "Limpeza",
  "15044": "Conservação/manutenção (exceto obras)",
  "15045": "Segurança/vigilância/transporte de valores",
  "15046": "Locação de mão de obra",
  "15047": "Assessoria creditícia, mercadológica, gestão de crédito",
  "15052": "Comissões e corretagens",
  "15099": "Demais serviços técnicos, administrativos e semelhantes",
};

// Subitem da lista da LC 116 (4 primeiros dígitos do cTribNac) → natureza.
const NATUREZA_POR_SUBITEM: Record<string, string> = {
  "0101": "15032", "0102": "15032", "0103": "15032", "0104": "15032",
  "0401": "15026", "0403": "15099", "0404": "15026", "0405": "15026",
  "0406": "15099", "0408": "15022", "0410": "15027", "0411": "15026",
  "0412": "15028", "0414": "15033", "0416": "15034",
  "0501": "15042",
  "0701": "15019", "0710": "15043", "0711": "15043",
  "0801": "15020", "0802": "15020",
  "1005": "15052", "1009": "15052",
  "1102": "15045",
  "1401": "15044", "1402": "15044",
  "1701": "15014", "1710": "15029", "1712": "15003", "1714": "15004",
  "1716": "15010", "1719": "15015", "1720": "15017", "1721": "15021",
  "1705": "15046",
};

/** Natureza sugerida pelo código de serviço (o usuário pode trocar na Central). */
export function sugerirNatureza(cTribNac: string | null, descricao: string | null, pessoaFisica: boolean): string {
  if (pessoaFisica) return "10002";
  const sub = (cTribNac ?? "").replace(/\D/g, "").slice(0, 4);
  if (sub === "0402") {
    // Análises clínicas, radiologia, tomografia, ultrassom... pelo texto.
    return /radiolog|radioter|tomograf|resson|ultra.?s|raio.?x|imagem|densitometr|mamograf/i.test(descricao ?? "") ? "15036" : "15005";
  }
  return NATUREZA_POR_SUBITEM[sub] ?? "15099";
}

/** "2026-10" → "15/11/2026" (dia 15 do mês seguinte; antecipa se cair em fim de semana). */
export function prazoReinf(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 15));
  const dia = d.getUTCDay();
  if (dia === 6) d.setUTCDate(14);
  if (dia === 0) d.setUTCDate(13);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
