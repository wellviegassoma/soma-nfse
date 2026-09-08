// Sugestão de retenção na fonte para pagamento a prestador PJ.
//
// O Nibo só aceita o valor digitado. Aqui a gente calcula — mas o resultado é
// SUGESTÃO, nunca aplicado sozinho: alíquota de ISS é municipal, o
// enquadramento do serviço depende do contrato, e prestador do Simples é
// dispensado de IRRF/CSRF mediante declaração. Quem confirma é o operador.
//
// Bases:
// - CSRF (CSLL 1% + PIS 0,65% + COFINS 3% = 4,65%): Lei 10.833/2003 art. 30.
//   Dispensa quando o valor retido fica igual ou menor que R$ 10,00, por
//   pagamento (Lei 10.833/2003 art. 31 § 3º, na redação da Lei 13.137/2015)
//   — o que dá um piso de base de R$ 215,06 (10 / 0,0465).
// - IRRF 1,5%: serviços profissionais (Decreto 9.580/2018 — RIR/2018 art. 714).
// - IRRF 1%: limpeza, conservação, segurança, vigilância e locação de mão de
//   obra (RIR/2018 art. 716).
// - INSS 11%: cessão de mão de obra e empreitada (Lei 8.212/1991 art. 31).
// - Simples Nacional: dispensado de IRRF e CSRF mediante declaração
//   (IN RFB 1.234/2012); o INSS de cessão de mão de obra continua devido.

export const CSRF_ALIQUOTA = 4.65;
export const CSRF_CSLL = 1;
export const CSRF_PIS = 0.65;
export const CSRF_COFINS = 3;
export const IRRF_SERVICOS_PROFISSIONAIS = 1.5;
export const IRRF_LIMPEZA_SEGURANCA = 1;
export const INSS_CESSAO_MAO_DE_OBRA = 11;

/** Piso de dispensa da CSRF: retenção de até R$ 10,00 não é feita. */
export const CSRF_VALOR_MINIMO_RETIDO = 10;

export type NaturezaServico =
  | "NENHUMA"
  | "SERVICOS_PROFISSIONAIS"
  | "LIMPEZA_SEGURANCA"
  | "CESSAO_MAO_DE_OBRA";

export const NATUREZA_SERVICO_LABELS: Record<NaturezaServico, string> = {
  NENHUMA: "Sem retenção",
  SERVICOS_PROFISSIONAIS: "Serviços profissionais (IRRF 1,5% + CSRF 4,65%)",
  LIMPEZA_SEGURANCA: "Limpeza, conservação, segurança, vigilância (IRRF 1% + CSRF 4,65%)",
  CESSAO_MAO_DE_OBRA: "Cessão de mão de obra (INSS 11% + IRRF 1% + CSRF 4,65%)",
};

export const NATUREZAS_SERVICO: NaturezaServico[] = [
  "NENHUMA",
  "SERVICOS_PROFISSIONAIS",
  "LIMPEZA_SEGURANCA",
  "CESSAO_MAO_DE_OBRA",
];

export type RetencoesSugeridas = {
  iss: number;
  irrf: number;
  csll: number;
  inss: number;
  pis: number;
  cofins: number;
  outras: number;
  /** Explicações mostradas ao operador — o que foi aplicado e o que não foi. */
  notas: string[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calcularRetencoes(params: {
  valorBruto: number;
  natureza: NaturezaServico;
  /** Prestador optante do Simples: dispensa IRRF e CSRF mediante declaração. */
  prestadorSimples?: boolean;
  /** Alíquota de ISS retido — municipal, então tem de vir de fora. */
  issAliquota?: number | null;
}): RetencoesSugeridas {
  const { valorBruto, natureza, prestadorSimples = false, issAliquota } = params;
  const notas: string[] = [];
  const zero: RetencoesSugeridas = {
    iss: 0,
    irrf: 0,
    csll: 0,
    inss: 0,
    pis: 0,
    cofins: 0,
    outras: 0,
    notas,
  };

  if (!Number.isFinite(valorBruto) || valorBruto <= 0) return zero;

  const r = { ...zero };

  // ISS: só se o município exigir retenção pelo tomador e a alíquota for
  // informada. Não existe alíquota padrão nacional — por isso nunca chutamos.
  if (issAliquota && issAliquota > 0) {
    r.iss = round2((valorBruto * issAliquota) / 100);
    notas.push(`ISS retido a ${issAliquota}% conforme a lei do município.`);
  } else {
    notas.push("ISS não calculado: a alíquota de retenção é municipal, informe se houver.");
  }

  if (natureza === "NENHUMA") {
    notas.push("Natureza marcada como sem retenção federal.");
    return r;
  }

  // INSS de cessão de mão de obra é devido inclusive de prestador do Simples.
  if (natureza === "CESSAO_MAO_DE_OBRA") {
    r.inss = round2((valorBruto * INSS_CESSAO_MAO_DE_OBRA) / 100);
    notas.push(`INSS retido a ${INSS_CESSAO_MAO_DE_OBRA}% (Lei 8.212/1991 art. 31).`);
  }

  if (prestadorSimples) {
    notas.push(
      "Prestador do Simples Nacional: IRRF e CSRF dispensados mediante declaração do prestador (IN RFB 1.234/2012). Guarde a declaração.",
    );
    return r;
  }

  const irrfAliquota =
    natureza === "SERVICOS_PROFISSIONAIS"
      ? IRRF_SERVICOS_PROFISSIONAIS
      : IRRF_LIMPEZA_SEGURANCA;
  r.irrf = round2((valorBruto * irrfAliquota) / 100);
  notas.push(`IRRF a ${irrfAliquota}% (código 1708).`);

  // CSRF: dispensada quando o valor retido não passa de R$ 10,00.
  const csrfTotal = (valorBruto * CSRF_ALIQUOTA) / 100;
  if (csrfTotal <= CSRF_VALOR_MINIMO_RETIDO) {
    notas.push(
      `CSRF dispensada: 4,65% sobre ${valorBruto.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })} daria ${csrfTotal.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      })}, igual ou abaixo do piso de R$ 10,00 (Lei 13.137/2015).`,
    );
  } else {
    r.csll = round2((valorBruto * CSRF_CSLL) / 100);
    r.pis = round2((valorBruto * CSRF_PIS) / 100);
    r.cofins = round2((valorBruto * CSRF_COFINS) / 100);
    notas.push("CSRF 4,65% (CSLL 1% + PIS 0,65% + COFINS 3%), código 5952.");
  }

  return r;
}
