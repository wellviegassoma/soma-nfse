import "server-only";

// Exportação das telas da Serena (Simples) e do Newton (Lucro Presumido) em
// Excel e PDF (pedido de 24/11/2026): todas as empresas da competência, cada
// etapa feita ou não, motivos, recado da IA e responsáveis. As duas telas
// viram o mesmo "relatório" e daí sai a planilha (aqui) e o PDF
// (analista-export-pdf.tsx).
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstadoEtapa, Etapa, LinhaSerena } from "@/lib/serena";
import type { LinhaNewton } from "@/lib/newton";
import { SOMA_LOGO_PNG_BASE64, SOMA_LOGO_PROPORCAO } from "@/lib/soma-logo-base64";

export type Analista = "SERENA" | "NEWTON";
export type SituacaoRel = "acao" | "ia" | "concluida";
type TipoValor = "moeda" | "numero" | "texto" | "pct";

export type LinhaRelatorio = {
  codigo: string;
  nome: string;
  municipio: string;
  etiquetas: string[];
  valores: (number | string | null)[];
  etapas: Record<string, Etapa | undefined>;
  situacao: SituacaoRel;
  recado: string;
  motivos: string[];
  aceitos: string[];
  responsaveis: { contabil: string; fiscal: string; dp: string; legalizacao: string };
};

export type RelatorioAnalista = {
  analista: Analista;
  nomeIa: string;
  regime: string;
  competencia: string; // AAAA-MM
  geradoEm: Date;
  filtroDescricao: string;
  colunasValor: { titulo: string; tipo: TipoValor }[];
  etapas: { chave: string; nome: string }[];
  linhas: LinhaRelatorio[];
  cartoes: { titulo: string; valor: string; detalhe: string }[];
};

// Cores da marca SOMA (logo): azul-marinho e dourado.
export const COR = {
  marinho: "#1F3A5A",
  dourado: "#C9A13B",
  texto: "#1F2937",
  suave: "#6B7280",
  linha: "#E5E7EB",
  fundo: "#F7F8FA",
  ok: "#059669",
  okFundo: "#D1FAE5",
  pendente: "#B45309",
  pendenteFundo: "#FEF3C7",
  problema: "#DC2626",
  problemaFundo: "#FEE2E2",
  na: "#9CA3AF",
  naFundo: "#F3F4F6",
  ia: "#6D28D9",
  iaFundo: "#EDE9FE",
};

export const ROTULO_ESTADO: Record<EstadoEtapa, string> = { ok: "Feito", pendente: "Pendente", problema: "Problema", na: "Não se aplica" };
export const SIMBOLO_ESTADO: Record<EstadoEtapa, string> = { ok: "✓", pendente: "•", problema: "!", na: "–" };
export const ROTULO_SITUACAO: Record<SituacaoRel, string> = { acao: "Precisa de ação", ia: "Com a IA", concluida: "Concluída" };

export const rotuloCompetenciaLonga = (c: string) => {
  const [a, m] = c.split("-").map(Number);
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${meses[m - 1]}/${a}`;
};
export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function separarCodigo(nome: string): { codigo: string; nome: string } {
  const m = nome.match(/^(\S+)\s·\s(.+)$/);
  return m ? { codigo: m[1], nome: m[2] } : { codigo: "", nome };
}

// ------------------------------------------------------------ responsáveis

type Responsaveis = LinhaRelatorio["responsaveis"];

async function responsaveisPorEmpresa(db: SupabaseClient, ids: string[], nomeIa: string): Promise<Map<string, Responsaveis>> {
  const mapa = new Map<string, Responsaveis>();
  if (!ids.length) return mapa;
  const { data, error } = await db
    .from("companies")
    .select("id, responsavel_contabil_id, responsavel_fiscal_id, responsavel_dp_id, responsavel_legalizacao_id")
    .in("id", ids);
  if (error) return mapa; // coluna ainda não existe (migration CM) — exporta sem responsáveis
  const pessoas = [
    ...new Set(
      (data ?? []).flatMap((c) => [c.responsavel_contabil_id, c.responsavel_fiscal_id, c.responsavel_dp_id, c.responsavel_legalizacao_id]).filter(Boolean) as string[],
    ),
  ];
  const { data: perfis } = pessoas.length ? await db.from("profiles").select("id, full_name, email").in("id", pessoas) : { data: [] };
  const nome = (id: unknown) => {
    const p = (perfis ?? []).find((x) => x.id === id);
    return p ? String(p.full_name || p.email || "").split(" ")[0] : "";
  };
  for (const c of data ?? []) {
    const apoio = nome(c.responsavel_fiscal_id);
    mapa.set(c.id as string, {
      contabil: nome(c.responsavel_contabil_id),
      fiscal: apoio ? `${nomeIa} (IA) + ${apoio}` : `${nomeIa} (IA)`,
      dp: nome(c.responsavel_dp_id),
      legalizacao: nome(c.responsavel_legalizacao_id),
    });
  }
  return mapa;
}

// ------------------------------------------------------------ montagem

export type FiltroExport = { situacao?: string; cidade?: string };

function aplicarFiltro<T extends { situacao: string; municipio: string }>(linhas: T[], f: FiltroExport, situacaoIa: string) {
  return linhas.filter(
    (l) =>
      (!f.situacao || f.situacao === "todas" || l.situacao === (f.situacao === "ia" ? situacaoIa : f.situacao)) &&
      (!f.cidade || l.municipio === f.cidade),
  );
}

function descreverFiltro(f: FiltroExport, nomeIa: string) {
  const s =
    !f.situacao || f.situacao === "todas"
      ? "Todas as empresas"
      : f.situacao === "acao"
        ? "Só as que precisam de ação"
        : f.situacao === "concluida"
          ? "Só as concluídas"
          : `Só as que estão com ${nomeIa === "Serena" ? "a" : "o"} ${nomeIa}`;
  return `${s} · ${f.cidade || "Petrópolis e Rio"}`;
}

function ordemEtapas(linhas: { etapas: Etapa[] }[]) {
  const vistas = new Map<string, string>();
  for (const l of linhas) for (const e of l.etapas) if (!vistas.has(e.chave)) vistas.set(e.chave, e.nome);
  return [...vistas].map(([chave, nome]) => ({ chave, nome }));
}

function cartoesComuns(linhas: { situacao: SituacaoRel }[]) {
  const n = (s: SituacaoRel) => linhas.filter((l) => l.situacao === s).length;
  return [
    { titulo: "Empresas", valor: String(linhas.length), detalhe: "no relatório" },
    { titulo: "Precisam de ação", valor: String(n("acao")), detalhe: "alguém da equipe precisa agir" },
    { titulo: "Com a IA", valor: String(n("ia")), detalhe: "andando sozinhas" },
    { titulo: "Concluídas", valor: String(n("concluida")), detalhe: "fechamento terminado" },
  ];
}

export async function relatorioSerena(db: SupabaseClient, competencia: string, todas: LinhaSerena[], f: FiltroExport): Promise<RelatorioAnalista> {
  const sel = aplicarFiltro(todas, f, "serena");
  const resp = await responsaveisPorEmpresa(db, sel.map((l) => l.id), "Serena");
  const linhas: LinhaRelatorio[] = sel.map((l) => {
    const { codigo, nome } = separarCodigo(l.nome);
    return {
      codigo,
      nome,
      municipio: l.municipio,
      etiquetas: [`Anexo ${l.anexo}`],
      valores: [l.receita, l.qtdNotas, l.anexo, l.fatorR, l.das],
      etapas: Object.fromEntries(l.etapas.map((e) => [e.chave, e])),
      situacao: l.situacao === "serena" ? "ia" : l.situacao,
      recado: l.recado,
      motivos: l.motivos.map((m) => `${m.nivel === "BLOQUEADO" ? "[bloqueio] " : ""}${m.texto}`),
      aceitos: l.motivosAceitos.map((m) => `${m.texto}${m.justificativa ? ` — ${m.justificativa}` : ""}`),
      responsaveis: resp.get(l.id) ?? { contabil: "", fiscal: "Serena (IA)", dp: "", legalizacao: "" },
    };
  });
  const receita = sel.reduce((t, l) => t + l.receita, 0);
  const das = sel.reduce((t, l) => t + l.das, 0);
  return {
    analista: "SERENA",
    nomeIa: "Serena",
    regime: "Simples Nacional",
    competencia,
    geradoEm: new Date(),
    filtroDescricao: descreverFiltro(f, "Serena"),
    colunasValor: [
      { titulo: "Receita", tipo: "moeda" },
      { titulo: "Notas", tipo: "numero" },
      { titulo: "Anexo", tipo: "texto" },
      { titulo: "Fator R", tipo: "pct" },
      { titulo: "DAS", tipo: "moeda" },
    ],
    etapas: ordemEtapas(sel),
    linhas,
    cartoes: [...cartoesComuns(linhas), { titulo: "Receita × DAS", valor: brl(das), detalhe: `sobre ${brl(receita)} de receita` }],
  };
}

export async function relatorioNewton(db: SupabaseClient, competencia: string, todas: LinhaNewton[], f: FiltroExport): Promise<RelatorioAnalista> {
  const sel = aplicarFiltro(todas, f, "newton");
  const resp = await responsaveisPorEmpresa(db, sel.map((l) => l.id), "Newton");
  const linhas: LinhaRelatorio[] = sel.map((l) => {
    const { codigo, nome } = separarCodigo(l.nome);
    return {
      codigo,
      nome,
      municipio: l.municipio,
      etiquetas: [l.issFixo ? "ISS fixo" : "", l.equiparacaoCadastro ? "Equiparação" : ""].filter(Boolean),
      valores: [l.calc.receitaMes, l.calc.devido.pis, l.calc.devido.cofins, l.calc.devido.irpj, l.calc.devido.csll, l.calc.total],
      etapas: Object.fromEntries(l.etapas.map((e) => [e.chave, e])),
      situacao: l.situacao === "newton" ? "ia" : l.situacao,
      recado: l.recado,
      motivos: l.motivos.map((m) => `${m.nivel === "BLOQUEADO" ? "[bloqueio] " : ""}${m.texto}`),
      aceitos: l.motivosAceitos.map((m) => `${m.texto}${m.justificativa ? ` — ${m.justificativa}` : ""}`),
      responsaveis: resp.get(l.id) ?? { contabil: "", fiscal: "Newton (IA)", dp: "", legalizacao: "" },
    };
  });
  const receita = sel.reduce((t, l) => t + l.calc.receitaMes, 0);
  const total = sel.reduce((t, l) => t + l.calc.total, 0);
  return {
    analista: "NEWTON",
    nomeIa: "Newton",
    regime: "Lucro Presumido",
    competencia,
    geradoEm: new Date(),
    filtroDescricao: descreverFiltro(f, "Newton"),
    colunasValor: [
      { titulo: "Receita", tipo: "moeda" },
      { titulo: "PIS", tipo: "moeda" },
      { titulo: "COFINS", tipo: "moeda" },
      { titulo: "IRPJ", tipo: "moeda" },
      { titulo: "CSLL", tipo: "moeda" },
      { titulo: "Total", tipo: "moeda" },
    ],
    etapas: ordemEtapas(sel),
    linhas,
    cartoes: [...cartoesComuns(linhas), { titulo: "Tributos federais", valor: brl(total), detalhe: `sobre ${brl(receita)} de receita` }],
  };
}

export function formatarValor(v: number | string | null, tipo: TipoValor): string {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  if (tipo === "moeda") return brl(v);
  if (tipo === "pct") return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("pt-BR");
}

// ------------------------------------------------------------ Excel

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const preencher = (hex: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const bordaFina: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: argb(COR.linha) } },
  bottom: { style: "thin", color: { argb: argb(COR.linha) } },
  left: { style: "thin", color: { argb: argb(COR.linha) } },
  right: { style: "thin", color: { argb: argb(COR.linha) } },
};
const COR_ESTADO: Record<EstadoEtapa, [string, string]> = {
  ok: [COR.ok, COR.okFundo],
  pendente: [COR.pendente, COR.pendenteFundo],
  problema: [COR.problema, COR.problemaFundo],
  na: [COR.na, COR.naFundo],
};
const COR_SITUACAO: Record<SituacaoRel, [string, string]> = {
  acao: [COR.pendente, COR.pendenteFundo],
  ia: [COR.ia, COR.iaFundo],
  concluida: [COR.ok, COR.okFundo],
};

function cabecalhoComLogo(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, rel: RelatorioAnalista, ultimaColuna: number, subtitulo: string) {
  const logo = wb.addImage({ base64: SOMA_LOGO_PNG_BASE64, extension: "png" });
  const altura = 62;
  ws.addImage(logo, { tl: { col: 0.15, row: 0.15 }, ext: { width: altura * SOMA_LOGO_PROPORCAO, height: altura } });
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 18;
  ws.mergeCells(1, 3, 1, ultimaColuna);
  ws.mergeCells(2, 3, 2, ultimaColuna);
  ws.mergeCells(3, 3, 3, ultimaColuna);
  const t = ws.getCell(1, 3);
  t.value = `${rel.nomeIa} · ${rel.regime} — ${subtitulo}`;
  t.font = { bold: true, size: 15, color: { argb: argb(COR.marinho) } };
  const s = ws.getCell(2, 3);
  s.value = `Competência ${rotuloCompetenciaLonga(rel.competencia)} · ${rel.filtroDescricao}`;
  s.font = { size: 11, color: { argb: argb(COR.dourado) }, bold: true };
  const g = ws.getCell(3, 3);
  g.value = `Gerado em ${rel.geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} pelo SOMA Gestão`;
  g.font = { size: 9, italic: true, color: { argb: argb(COR.suave) } };
  // faixa dourada
  for (let c = 1; c <= ultimaColuna; c++) ws.getCell(4, c).border = { bottom: { style: "medium", color: { argb: argb(COR.dourado) } } };
  ws.getRow(4).height = 6;
}

export async function gerarExcelAnalista(rel: RelatorioAnalista): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOMA Gestão";
  wb.created = rel.geradoEm;

  // Resumo é a primeira aba; preenchida no fim.
  const rs = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });

  // ---------------- Aba Empresas
  const ws = wb.addWorksheet("Empresas", {
    views: [{ state: "frozen", ySplit: 6, xSplit: 2, showGridLines: false }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const fixas = [
    { t: "Código", w: 9 },
    { t: "Empresa", w: 34 },
    { t: "Cidade", w: 14 },
    { t: "Etiquetas", w: 16 },
    { t: "Situação", w: 16 },
  ];
  const valores = rel.colunasValor.map((c) => ({ t: c.titulo, w: c.tipo === "moeda" ? 14 : c.tipo === "texto" ? 10 : 9 }));
  const etapas = rel.etapas.map((e) => ({ t: e.nome, w: 15 }));
  const finais = [
    { t: "Recado da IA", w: 52 },
    { t: "Motivos pendentes", w: 46 },
    { t: "Motivos aceitos", w: 40 },
    { t: "Resp. Fiscal", w: 20 },
    { t: "Resp. Contábil", w: 14 },
    { t: "Resp. DP", w: 14 },
    { t: "Resp. Legalização", w: 16 },
  ];
  const todas = [...fixas, ...valores, ...etapas, ...finais];
  todas.forEach((c, i) => (ws.getColumn(i + 1).width = c.w));
  cabecalhoComLogo(wb, ws, rel, todas.length, "empresas e etapas");

  // linha 5: grupos de colunas
  const linhaGrupo = ws.getRow(5);
  linhaGrupo.height = 18;
  const grupos: [string, number, number][] = [
    ["Empresa", 1, fixas.length],
    ["Valores do mês", fixas.length + 1, fixas.length + valores.length],
    ["Etapas do fechamento", fixas.length + valores.length + 1, fixas.length + valores.length + etapas.length],
    ["Acompanhamento", fixas.length + valores.length + etapas.length + 1, todas.length],
  ];
  for (const [rot, de, ate] of grupos) {
    if (ate < de) continue;
    if (ate > de) ws.mergeCells(5, de, 5, ate);
    const c = ws.getCell(5, de);
    c.value = rot;
    c.font = { bold: true, size: 9, color: { argb: argb(COR.marinho) } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.fill = preencher("#E8EDF4");
  }

  const cab = ws.getRow(6);
  cab.values = todas.map((c) => c.t);
  cab.height = 30;
  cab.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    c.fill = preencher(COR.marinho);
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = bordaFina;
  });

  rel.linhas.forEach((l, i) => {
    const r = ws.getRow(7 + i);
    const vals: (string | number | null)[] = [
      l.codigo ? (Number.isFinite(Number(l.codigo)) ? Number(l.codigo) : l.codigo) : "",
      l.nome,
      l.municipio,
      l.etiquetas.join(", "),
      ROTULO_SITUACAO[l.situacao],
      ...l.valores.map((v, k) => (v == null ? "" : typeof v === "number" && rel.colunasValor[k].tipo === "moeda" ? Math.round(v * 100) / 100 : v)),
      ...rel.etapas.map((e) => {
        const et = l.etapas[e.chave];
        return et ? `${SIMBOLO_ESTADO[et.estado]} ${et.titulo}${et.detalhe ? ` · ${et.detalhe}` : ""}` : "";
      }),
      l.recado,
      l.motivos.join("\n"),
      l.aceitos.join("\n"),
      l.responsaveis.fiscal,
      l.responsaveis.contabil,
      l.responsaveis.dp,
      l.responsaveis.legalizacao,
    ];
    r.values = vals;
    const zebra = i % 2 === 1 ? COR.fundo : "#FFFFFF";
    r.eachCell({ includeEmpty: true }, (c, col) => {
      c.border = bordaFina;
      c.alignment = { vertical: "top", wrapText: col > fixas.length + valores.length };
      c.font = { size: 10, color: { argb: argb(COR.texto) } };
      c.fill = preencher(zebra);
    });
    ws.getCell(7 + i, 1).alignment = { vertical: "top", horizontal: "center" };
    ws.getCell(7 + i, 2).font = { size: 10, bold: true, color: { argb: argb(COR.marinho) } };
    const sit = ws.getCell(7 + i, 5);
    sit.fill = preencher(COR_SITUACAO[l.situacao][1]);
    sit.font = { size: 10, bold: true, color: { argb: argb(COR_SITUACAO[l.situacao][0]) } };
    rel.colunasValor.forEach((cv, k) => {
      const c = ws.getCell(7 + i, fixas.length + 1 + k);
      c.numFmt = cv.tipo === "moeda" ? '"R$" #,##0.00' : cv.tipo === "pct" ? "0.0%" : cv.tipo === "numero" ? "0" : "@";
      c.alignment = { vertical: "top", horizontal: cv.tipo === "texto" ? "center" : "right" };
    });
    rel.etapas.forEach((e, k) => {
      const et = l.etapas[e.chave];
      if (!et) return;
      const c = ws.getCell(7 + i, fixas.length + valores.length + 1 + k);
      const [fg, bg] = COR_ESTADO[et.estado];
      c.fill = preencher(bg);
      c.font = { size: 9, bold: et.estado !== "na", color: { argb: argb(fg) } };
    });
    const linhasTexto = Math.max(1, l.motivos.length, l.aceitos.length, Math.ceil(l.recado.length / 60));
    r.height = Math.min(15 * linhasTexto + 4, 120);
  });

  // Totais
  const ultima = 7 + rel.linhas.length;
  const tot = ws.getRow(ultima);
  tot.getCell(2).value = `Total · ${rel.linhas.length} empresas`;
  rel.colunasValor.forEach((cv, k) => {
    if (cv.tipo !== "moeda" && cv.tipo !== "numero") return;
    const col = fixas.length + 1 + k;
    const letra = ws.getColumn(col).letter;
    const c = tot.getCell(col);
    c.value = rel.linhas.length ? { formula: `SUBTOTAL(9,${letra}7:${letra}${ultima - 1})` } : 0;
    c.numFmt = cv.tipo === "moeda" ? '"R$" #,##0.00' : "0";
  });
  tot.eachCell({ includeEmpty: true }, (c, col) => {
    if (col > todas.length) return;
    c.font = { bold: true, color: { argb: argb(COR.marinho) } };
    c.fill = preencher("#E8EDF4");
    c.border = { top: { style: "medium", color: { argb: argb(COR.marinho) } } };
  });
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, ultima - 1), column: todas.length } };

  // ---------------- Aba Resumo
  rs.getColumn(1).width = 4;
  rs.getColumn(2).width = 30;
  [3, 4, 5, 6, 7].forEach((c) => (rs.getColumn(c).width = 16));
  cabecalhoComLogo(wb, rs, rel, 7, "resumo");
  let lin = 6;
  const titulo = (txt: string) => {
    const c = rs.getCell(lin, 2);
    c.value = txt;
    c.font = { bold: true, size: 12, color: { argb: argb(COR.marinho) } };
    lin += 1;
  };
  titulo("Carteira");
  for (const card of rel.cartoes) {
    rs.getCell(lin, 2).value = card.titulo;
    rs.getCell(lin, 2).font = { color: { argb: argb(COR.suave) } };
    const v = rs.getCell(lin, 3);
    v.value = card.valor;
    v.font = { bold: true, size: 12, color: { argb: argb(COR.texto) } };
    rs.mergeCells(lin, 4, lin, 7);
    rs.getCell(lin, 4).value = card.detalhe;
    rs.getCell(lin, 4).font = { size: 9, italic: true, color: { argb: argb(COR.suave) } };
    lin += 1;
  }
  lin += 1;
  titulo("Etapas");
  const cabE = rs.getRow(lin);
  ["", "Etapa", "Feito", "Pendente", "Problema", "Não se aplica", "% feito"].forEach((t, k) => {
    if (!k) return;
    const c = cabE.getCell(k + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = preencher(COR.marinho);
    c.alignment = { horizontal: k > 1 ? "center" : "left" };
  });
  lin += 1;
  for (const e of rel.etapas) {
    const n = (s: EstadoEtapa) => rel.linhas.filter((l) => l.etapas[e.chave]?.estado === s).length;
    const aplica = rel.linhas.length - n("na");
    const r = rs.getRow(lin);
    r.getCell(2).value = e.nome;
    (["ok", "pendente", "problema", "na"] as EstadoEtapa[]).forEach((s, k) => {
      const c = r.getCell(3 + k);
      c.value = n(s);
      c.alignment = { horizontal: "center" };
      c.font = { bold: n(s) > 0, color: { argb: argb(COR_ESTADO[s][0]) } };
      if (n(s) > 0) c.fill = preencher(COR_ESTADO[s][1]);
    });
    const p = r.getCell(7);
    p.value = aplica ? n("ok") / aplica : null;
    p.numFmt = "0%";
    p.alignment = { horizontal: "center" };
    p.font = { bold: true, color: { argb: argb(COR.marinho) } };
    r.eachCell({ includeEmpty: true }, (c, col) => {
      if (col >= 2 && col <= 7) c.border = bordaFina;
    });
    lin += 1;
  }
  lin += 1;
  rs.getCell(lin, 2).value = "Legenda: ✓ feito · • pendente · ! problema · – não se aplica. A aba Empresas tem filtro em cada coluna.";
  rs.getCell(lin, 2).font = { size: 9, italic: true, color: { argb: argb(COR.suave) } };

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}

export function nomeArquivoAnalista(rel: RelatorioAnalista, ext: "xlsx" | "pdf") {
  return `${rel.nomeIa.toLowerCase()}-${rel.competencia}.${ext}`;
}
