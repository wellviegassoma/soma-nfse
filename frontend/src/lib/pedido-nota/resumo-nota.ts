// Texto da mensagem que acompanha o PDF da nota no WhatsApp do cliente:
// basicamente o que está no DANFSe (número, tomador com CPF/CNPJ, descrição,
// competência, valores, retenções, chave de acesso). Lê do XML da NFS-e
// Nacional — mesmos campos que backend/danfse.py usa no PDF. Sem banco, sem
// "server-only": testável isolado.

function bloco(xml: string, tag: string): string {
  const m = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`).exec(xml);
  return m?.[1] ?? "";
}

/** Valor de uma tag; `caminho` como "toma/xNome" desce bloco por bloco. */
function tag(xml: string, caminho: string): string | null {
  const partes = caminho.split("/");
  let atual = xml;
  for (const p of partes.slice(0, -1)) atual = bloco(atual, p);
  const m = new RegExp(`<(?:\\w+:)?${partes.at(-1)}\\b[^>]*>([^<]*)</`).exec(atual);
  return m ? desescapar(m[1].trim()) : null;
}

function desescapar(t: string) {
  return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (t: string | null) => (t == null || t === "" ? null : Number(t));

function formatarDoc(d: string) {
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return d;
}

function data(iso: string | null, comHora = false) {
  if (!iso) return null;
  const [d, h] = iso.split("T");
  const [y, m, dd] = d.split("-");
  if (!y || !m || !dd) return iso;
  return `${dd}/${m}/${y}${comHora && h ? ` ${h.slice(0, 5)}` : ""}`;
}

export type ResumoNota = {
  numero: string | null;
  prestador: string | null;
  tomadorNome: string | null;
  tomadorDoc: string | null;
  descricao: string | null;
  competencia: string | null;
  emitidaEm: string | null;
  valorServico: number | null;
  valorLiquido: number | null;
  retencoes: { nome: string; valor: number }[];
  chave: string | null;
};

export function resumirNota(xml: string, chaveAcesso?: string | null): ResumoNota {
  const inf = bloco(xml, "infNFSe") || xml;
  const dps = bloco(inf, "infDPS") || inf;
  const toma = bloco(dps, "toma");
  const docToma = tag(toma, "CNPJ") ?? tag(toma, "CPF");
  const valoresNfse = bloco(inf.replace(bloco(inf, "DPS"), ""), "valores");
  const tribFed = bloco(dps, "tribFed");

  const retencoes: { nome: string; valor: number }[] = [];
  for (const [k, nome] of [
    ["vRetIRRF", "IRRF"],
    ["vRetCSLL", "PIS/COFINS/CSLL"],
    ["vRetCP", "INSS"],
  ] as const) {
    const v = num(tag(tribFed, k));
    if (v && v > 0) retencoes.push({ nome, valor: v });
  }
  // ISS retido pelo tomador (tpRetISSQN 2 ou 3 = retido).
  const tpRet = tag(dps, "tribMun/tpRetISSQN");
  const vIss = num(tag(valoresNfse, "vISSQN"));
  if (tpRet && tpRet !== "1" && vIss && vIss > 0) retencoes.push({ nome: "ISS retido", valor: vIss });

  const id = /<infNFSe[^>]*\bId="NFS(\d+)"/.exec(xml)?.[1] ?? null;
  return {
    numero: tag(inf, "nNFSe"),
    prestador: tag(inf, "emit/xNome") ?? tag(dps, "prest/xNome"),
    tomadorNome: tag(toma, "xNome"),
    tomadorDoc: docToma ? formatarDoc(docToma) : null,
    descricao: tag(dps, "serv/cServ/xDescServ"),
    competencia: data(tag(dps, "dCompet")),
    emitidaEm: data(tag(inf, "dhProc"), true),
    valorServico: num(tag(dps, "valores/vServPrest/vServ")),
    valorLiquido: num(tag(valoresNfse, "vLiq")),
    retencoes,
    chave: chaveAcesso ?? id,
  };
}

/** Texto da mensagem ao cliente (vai junto com o PDF). */
export function textoParaCliente(r: ResumoNota): string {
  const linhas = [`Olá! Segue a nota fiscal${r.numero ? ` nº ${r.numero}` : ""}.`, ""];
  if (r.tomadorNome) linhas.push(`👤 Tomador: ${r.tomadorNome}${r.tomadorDoc ? ` — ${r.tomadorDoc}` : ""}`);
  if (r.valorServico != null) linhas.push(`💰 Valor do serviço: ${moeda(r.valorServico)}`);
  for (const ret of r.retencoes) linhas.push(`➖ ${ret.nome}: ${moeda(ret.valor)}`);
  if (r.valorLiquido != null && r.valorServico != null && Math.abs(r.valorLiquido - r.valorServico) >= 0.01) {
    linhas.push(`💵 Valor líquido: ${moeda(r.valorLiquido)}`);
  }
  if (r.descricao) linhas.push(`📝 Descrição: ${r.descricao}`);
  if (r.competencia) linhas.push(`📅 Competência: ${r.competencia}`);
  if (r.emitidaEm) linhas.push(`🕒 Emitida em: ${r.emitidaEm}`);
  if (r.prestador) linhas.push(`🏢 Prestador: ${r.prestador}`);
  if (r.chave) linhas.push(`🔑 Chave de acesso: ${r.chave}`);
  linhas.push("", "O PDF da nota segue em anexo.");
  return linhas.join("\n");
}
