import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarProcedimentosComMargem } from "./queries";
import type { ProcedimentoComMargem } from "@/components/precificacao/ProcedimentosTable";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Mesma paleta de tons do app (globals.css) — só sem canal alpha, que o
// Excel não aceita em ARGB de preenchimento sólido.
const COR_MARCA = "FF1D4ED8";
const COR_SUCESSO = "FF15803D";
const COR_SUCESSO_SOFT = "FFDCFCE7";
const COR_ALERTA = "FFB45309";
const COR_ALERTA_SOFT = "FFFEF3C7";
const COR_PERIGO = "FFDC2626";
const COR_PERIGO_SOFT = "FFFEE2E2";
const COR_CABECALHO_TEXTO = "FFFFFFFF";
const COR_CINZA_CLARO = "FFF3F4F6";
const COR_CINZA_TEXTO = "FF6B7280";

function tomPorMargem(margemPct: number): { fundo: string; fonte: string } {
  if (margemPct < 0) return { fundo: COR_PERIGO_SOFT, fonte: COR_PERIGO };
  if (margemPct < 0.15) return { fundo: COR_ALERTA_SOFT, fonte: COR_ALERTA };
  return { fundo: COR_SUCESSO_SOFT, fonte: COR_SUCESSO };
}

function preencher(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function celulaKpi(
  ws: ExcelJS.Worksheet,
  linha: number,
  coluna: number,
  largura: number,
  rotulo: string,
  valor: string,
  corValor: string,
) {
  const rRotulo = ws.getRow(linha);
  const rValor = ws.getRow(linha + 1);
  const c1 = rRotulo.getCell(coluna);
  const c2 = rValor.getCell(coluna);
  ws.mergeCells(linha, coluna, linha, coluna + largura - 1);
  ws.mergeCells(linha + 1, coluna, linha + 1, coluna + largura - 1);
  c1.value = rotulo;
  c1.font = { size: 10, color: { argb: COR_CINZA_TEXTO }, bold: true };
  c1.alignment = { vertical: "middle" };
  c2.value = valor;
  c2.font = { size: 18, bold: true, color: { argb: corValor } };
  c2.alignment = { vertical: "middle" };
  for (let col = coluna; col < coluna + largura; col++) {
    preencher(rRotulo.getCell(col), COR_CINZA_CLARO);
    preencher(rValor.getCell(col), COR_CINZA_CLARO);
  }
  rRotulo.getCell(coluna).border = { top: { style: "thin", color: { argb: "FFE5E7EB" } }, left: { style: "thin", color: { argb: "FFE5E7EB" } } };
  rValor.getCell(coluna + largura - 1).border = { right: { style: "thin", color: { argb: "FFE5E7EB" } }, bottom: { style: "thin", color: { argb: "FFE5E7EB" } } };
}

function formatarPercentualTexto(v: number): string {
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function formatarMoedaTexto(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function gerarExcelPrecificacao(
  supabase: AnySupabaseClient,
  companyId: string,
  nomeEmpresa: string,
): Promise<Buffer> {
  const rows = await buscarProcedimentosComMargem(supabase, companyId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SOMA Gestão";
  workbook.created = new Date();

  // ---------- Aba 1: Dashboard ----------
  const dash = workbook.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
  });
  dash.columns = Array.from({ length: 8 }, () => ({ width: 15 }));

  dash.mergeCells("A1:H1");
  const titulo = dash.getCell("A1");
  titulo.value = "Precificação de Procedimentos";
  titulo.font = { size: 20, bold: true, color: { argb: COR_MARCA } };
  dash.getRow(1).height = 30;

  dash.mergeCells("A2:H2");
  const subtitulo = dash.getCell("A2");
  subtitulo.value = `${nomeEmpresa} · gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  subtitulo.font = { size: 11, color: { argb: COR_CINZA_TEXTO } };
  dash.getRow(2).height = 20;

  const ativos = rows.filter((r) => r.procedimento.ativo);
  const totalProcedimentos = rows.length;
  const emPrejuizo = rows.filter((r) => r.margemPct < 0).length;
  const margemMedia =
    ativos.length > 0 ? ativos.reduce((acc, r) => acc + r.margemPct, 0) / ativos.length : 0;
  const receitaLiquidaTotal = ativos.reduce((acc, r) => acc + r.receitaLiquida, 0);
  const melhor = ativos.length > 0 ? ativos.reduce((a, b) => (b.margemPct > a.margemPct ? b : a)) : null;
  const pior = ativos.length > 0 ? ativos.reduce((a, b) => (b.margemPct < a.margemPct ? b : a)) : null;

  const linhaKpis = 4;
  celulaKpi(dash, linhaKpis, 1, 2, "PROCEDIMENTOS", String(totalProcedimentos), "FF111827");
  celulaKpi(dash, linhaKpis, 3, 2, "MARGEM MÉDIA", formatarPercentualTexto(margemMedia), tomPorMargem(margemMedia).fonte);
  celulaKpi(dash, linhaKpis, 5, 2, "RECEITA LÍQUIDA (SOMA)", formatarMoedaTexto(receitaLiquidaTotal), "FF111827");
  celulaKpi(dash, linhaKpis, 7, 2, "EM PREJUÍZO", String(emPrejuizo), emPrejuizo > 0 ? COR_PERIGO : COR_SUCESSO);
  dash.getRow(linhaKpis).height = 18;
  dash.getRow(linhaKpis + 1).height = 26;

  if (melhor && pior) {
    const linhaDestaque = linhaKpis + 3;
    dash.mergeCells(linhaDestaque, 1, linhaDestaque, 4);
    dash.mergeCells(linhaDestaque, 5, linhaDestaque, 8);
    const cMelhorTitulo = dash.getCell(linhaDestaque, 1);
    cMelhorTitulo.value = "🏆 MELHOR PROCEDIMENTO (MARGEM)";
    cMelhorTitulo.font = { size: 10, bold: true, color: { argb: COR_SUCESSO } };
    const cPiorTitulo = dash.getCell(linhaDestaque, 5);
    cPiorTitulo.value = "⚠ PIOR PROCEDIMENTO (MARGEM)";
    cPiorTitulo.font = { size: 10, bold: true, color: { argb: COR_PERIGO } };

    const linhaDetalhe = linhaDestaque + 1;
    dash.mergeCells(linhaDetalhe, 1, linhaDetalhe, 4);
    dash.mergeCells(linhaDetalhe, 5, linhaDetalhe, 8);
    const cMelhorValor = dash.getCell(linhaDetalhe, 1);
    cMelhorValor.value = `${melhor.procedimento.nome} — ${formatarPercentualTexto(melhor.margemPct)} (${formatarMoedaTexto(melhor.procedimento.preco_venda)})`;
    cMelhorValor.font = { size: 12, bold: true };
    preencher(cMelhorValor, COR_SUCESSO_SOFT);
    for (let col = 1; col <= 4; col++) preencher(dash.getCell(linhaDetalhe, col), COR_SUCESSO_SOFT);

    const cPiorValor = dash.getCell(linhaDetalhe, 5);
    cPiorValor.value = `${pior.procedimento.nome} — ${formatarPercentualTexto(pior.margemPct)} (${formatarMoedaTexto(pior.procedimento.preco_venda)})`;
    cPiorValor.font = { size: 12, bold: true };
    preencher(cPiorValor, COR_PERIGO_SOFT);
    for (let col = 5; col <= 8; col++) preencher(dash.getCell(linhaDetalhe, col), COR_PERIGO_SOFT);
    dash.getRow(linhaDetalhe).height = 22;
  }

  // Ranking — top 5 melhores / top 5 piores margens, lado a lado.
  const linhaRanking = linhaKpis + 6;
  dash.getCell(linhaRanking, 1).value = "Top 5 melhores margens";
  dash.getCell(linhaRanking, 1).font = { size: 11, bold: true, color: { argb: COR_SUCESSO } };
  dash.mergeCells(linhaRanking, 1, linhaRanking, 4);
  dash.getCell(linhaRanking, 5).value = "Top 5 piores margens";
  dash.getCell(linhaRanking, 5).font = { size: 11, bold: true, color: { argb: COR_PERIGO } };
  dash.mergeCells(linhaRanking, 5, linhaRanking, 8);

  const melhores = [...ativos].sort((a, b) => b.margemPct - a.margemPct).slice(0, 5);
  const piores = [...ativos].sort((a, b) => a.margemPct - b.margemPct).slice(0, 5);
  for (let i = 0; i < 5; i++) {
    const linha = linhaRanking + 1 + i;
    const m = melhores[i];
    const p = piores[i];
    if (m) {
      dash.mergeCells(linha, 1, linha, 3);
      const nomeCell = dash.getCell(linha, 1);
      nomeCell.value = `${i + 1}. ${m.procedimento.nome}`;
      nomeCell.font = { size: 10 };
      const pctCell = dash.getCell(linha, 4);
      pctCell.value = formatarPercentualTexto(m.margemPct);
      pctCell.font = { size: 10, bold: true, color: { argb: COR_SUCESSO } };
      pctCell.alignment = { horizontal: "right" };
    }
    if (p) {
      dash.mergeCells(linha, 5, linha, 7);
      const nomeCell = dash.getCell(linha, 5);
      nomeCell.value = `${i + 1}. ${p.procedimento.nome}`;
      nomeCell.font = { size: 10 };
      const pctCell = dash.getCell(linha, 8);
      pctCell.value = formatarPercentualTexto(p.margemPct);
      pctCell.font = { size: 10, bold: true, color: { argb: COR_PERIGO } };
      pctCell.alignment = { horizontal: "right" };
    }
  }

  // ---------- Aba 2: Procedimentos (detalhado) ----------
  const tabela = workbook.addWorksheet("Procedimentos", { views: [{ state: "frozen", ySplit: 1 }] });
  const colunas: Partial<ExcelJS.Column>[] = [
    { header: "Procedimento", key: "nome", width: 32 },
    { header: "Especialidade", key: "especialidade", width: 18 },
    { header: "Ativo", key: "ativo", width: 8 },
    { header: "Preço de venda", key: "preco", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Custo material", key: "material", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Custo fixo (tempo)", key: "fixo", width: 16, style: { numFmt: "R$ #,##0.00" } },
    { header: "Custo laboratório", key: "laboratorio", width: 15, style: { numFmt: "R$ #,##0.00" } },
    { header: "Honorário fixo", key: "honorario", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Retrabalho", key: "retrabalho", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Imposto", key: "imposto", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Taxa cartão", key: "cartao", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Custo total", key: "custoTotal", width: 13, style: { numFmt: "R$ #,##0.00" } },
    { header: "Receita líquida", key: "receita", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Margem %", key: "margem", width: 12, style: { numFmt: "0.0%" } },
  ];
  tabela.columns = colunas;

  const headerRow = tabela.getRow(1);
  headerRow.eachCell((cell) => {
    preencher(cell, COR_MARCA);
    cell.font = { bold: true, color: { argb: COR_CABECALHO_TEXTO } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 28;

  rows.forEach((r: ProcedimentoComMargem) => {
    const row = tabela.addRow({
      nome: r.procedimento.nome,
      especialidade: r.procedimento.especialidade ?? "—",
      ativo: r.procedimento.ativo ? "Sim" : "Não",
      preco: r.procedimento.preco_venda,
      material: r.custoMaterial,
      fixo: r.custoFixoProcedimento,
      laboratorio: r.procedimento.custo_laboratorio,
      honorario: r.procedimento.honorario_profissional_fixo,
      retrabalho: r.retrabalhoValor,
      imposto: r.impostoValor,
      cartao: r.taxaCartaoValor,
      custoTotal: r.custoTotal,
      receita: r.receitaLiquida,
      margem: r.margemPct,
    });
    const tom = tomPorMargem(r.margemPct);
    const margemCell = row.getCell("margem");
    preencher(margemCell, tom.fundo);
    margemCell.font = { bold: true, color: { argb: tom.fonte } };
  });

  tabela.autoFilter = { from: "A1", to: `N${rows.length + 1}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
