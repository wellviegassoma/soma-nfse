// Texto da cobrança de extratos pelo WhatsApp. Puro (sem server-only) para a
// tela poder mostrar a prévia exatamente como vai sair.

export type ItemCobranca = {
  contaId: string;
  banco: string;
  agencia: string;
  conta: string;
  meses: string[]; // YYYY-MM, mais antigo primeiro
};

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function nomeCompetencia(c: string): string {
  const [ano, mes] = c.split("-").map(Number);
  return `${MESES[mes - 1]}/${ano}`;
}

/** "setembro e outubro/2026", "dezembro/2025 e janeiro/2026". */
export function listaMeses(meses: string[]): string {
  const porAno = new Map<string, string[]>();
  for (const m of meses) {
    const [ano, mes] = m.split("-");
    porAno.set(ano, [...(porAno.get(ano) ?? []), MESES[Number(mes) - 1]]);
  }
  const partes = [...porAno].map(([ano, nomes]) =>
    nomes.length === 1 ? `${nomes[0]}/${ano}` : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}/${ano}`,
  );
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

const vazio = (v: string) => !v || v.trim() === "-" || v.trim() === "";

function descreverConta(i: ItemCobranca): string {
  const ag = vazio(i.agencia) ? null : `ag. ${i.agencia}`;
  const cc = vazio(i.conta) ? null : `conta ${i.conta}`;
  const dados = [ag, cc].filter(Boolean).join(" / ");
  return `*${i.banco}*${dados ? ` (${dados})` : ""}`;
}

export function mensagemCobrancaExtratos(p: {
  empresa: string;
  itens: ItemCobranca[];
  competencia: string;
}): string {
  if (p.itens.length === 0) {
    return [
      "Olá! Tudo bem?",
      "",
      `Para fecharmos a contabilidade da *${p.empresa}* de ${nomeCompetencia(p.competencia)}, precisamos dos extratos bancários da empresa.`,
      "",
      "Pode nos informar em quais bancos a empresa tem conta e nos enviar os extratos do mês por aqui? Se possível, em PDF ou OFX (o arquivo exportado do internet banking).",
      "",
      "Obrigado!",
    ].join("\n");
  }
  return [
    "Olá! Tudo bem?",
    "",
    `Para fecharmos a contabilidade da *${p.empresa}*, ainda precisamos dos seguintes extratos bancários:`,
    "",
    ...p.itens.map((i) => `• ${descreverConta(i)}: ${listaMeses(i.meses)}`),
    "",
    "Pode nos enviar por aqui? Se possível, em PDF ou OFX (o arquivo exportado do internet banking).",
    "",
    "Obrigado!",
  ].join("\n");
}
