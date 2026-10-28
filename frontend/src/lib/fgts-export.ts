import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarCnpj } from "@/lib/formatters";
import { guiasEmAberto, type GuiaFgts } from "@/lib/fgts-infosimples";
import { periodoLegivel } from "@/lib/fgts-periodo";

type Consulta = {
  company_id: string;
  periodo: string;
  consultado_em: string;
  status: "sucesso" | "erro";
  erro: string | null;
  guias: GuiaFgts[];
};

const MOEDA = "R$ #,##0.00";

// "dd/mm/aaaa" (formato da Infosimples) → Date, pra planilha ordenar e
// filtrar como data de verdade.
function dataBr(texto: string | null): Date | null {
  const m = texto?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))) : null;
}

function estiloCabecalho(ws: ExcelJS.Worksheet) {
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

/**
 * Planilha das pendências de FGTS a partir das consultas já feitas
 * (fgts_guias_consultas, uma por empresa e competência) — não consulta a
 * Infosimples de novo. Aba "Pendências": uma linha por guia em aberto, de
 * qualquer competência consultada (mesma regra da Central,
 * guiasEmAberto). Aba "Resumo por empresa": uma linha por empresa ativa
 * com CNPJ, juntando todas as competências consultadas.
 */
export async function gerarPlanilhaPendenciasFgts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  agora: Date,
): Promise<Buffer> {
  const [{ data: companies }, { data: consultas }, { data: certificados }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, codigo_cliente, cnpj")
      .eq("ativa", true)
      .not("cnpj", "is", null)
      .order("legal_name"),
    supabase.from("fgts_guias_consultas").select("company_id, periodo, consultado_em, status, erro, guias"),
    supabase.from("certificates").select("company_id, expires_at"),
  ]);
  const consultasPorEmpresa = new Map<string, Consulta[]>();
  for (const c of (consultas ?? []) as Consulta[]) {
    consultasPorEmpresa.set(c.company_id, [...(consultasPorEmpresa.get(c.company_id) ?? []), c]);
  }
  const validadePorEmpresa = new Map((certificados ?? []).map((c) => [c.company_id as string, c.expires_at as string]));

  const workbook = new ExcelJS.Workbook();

  const wsPend = workbook.addWorksheet("Pendências", { views: [{ state: "frozen", ySplit: 1 }] });
  wsPend.columns = [
    { header: "Código", key: "codigo", width: 9 },
    { header: "Empresa", key: "empresa", width: 45 },
    { header: "CNPJ", key: "cnpj", width: 20 },
    { header: "Competência", key: "competencia", width: 12 },
    { header: "Tipo", key: "tipo", width: 14 },
    { header: "Nº da guia", key: "numero", width: 16 },
    { header: "Situação", key: "situacao", width: 16 },
    { header: "Emissão", key: "emissao", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Vencimento", key: "vencimento", width: 12, style: { numFmt: "dd/mm/yyyy" } },
    { header: "Dias em atraso", key: "atraso", width: 13 },
    { header: "Valor", key: "valor", width: 14, style: { numFmt: MOEDA } },
    { header: "Consultado em", key: "consultado", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
    { header: "PDF da guia", key: "pdf", width: 14 },
  ];

  const wsResumo = workbook.addWorksheet("Resumo por empresa", { views: [{ state: "frozen", ySplit: 1 }] });
  wsResumo.columns = [
    { header: "Código", key: "codigo", width: 9 },
    { header: "Empresa", key: "empresa", width: 45 },
    { header: "CNPJ", key: "cnpj", width: 20 },
    { header: "Certificado digital", key: "certificado", width: 22 },
    { header: "Situação FGTS", key: "situacao", width: 22 },
    { header: "Competências consultadas", key: "competencias", width: 26 },
    { header: "Guias em aberto", key: "qtd", width: 15 },
    { header: "Valor em aberto", key: "valor", width: 15, style: { numFmt: MOEDA } },
    { header: "Guias encontradas", key: "guias", width: 60 },
    { header: "Erro da consulta", key: "erro", width: 60 },
    { header: "Consultado em", key: "consultado", width: 18, style: { numFmt: "dd/mm/yyyy hh:mm" } },
  ];

  // "Hoje" no calendário de Brasília — em UTC, depois das 21h já seria o
  // dia seguinte e o atraso sairia com 1 dia a mais.
  const [anoHoje, mesHoje, diaHoje] = agora
    .toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
    .split("-")
    .map(Number);
  const hoje = Date.UTC(anoHoje, mesHoje - 1, diaHoje);
  const pendencias: { valores: Record<string, unknown>; pdf: string | null }[] = [];

  for (const company of companies ?? []) {
    const doEmpresa = (consultasPorEmpresa.get(company.id) ?? []).sort((a, b) => b.periodo.localeCompare(a.periodo));
    const validade = validadePorEmpresa.get(company.id) ?? null;
    const base = {
      codigo: company.codigo_cliente ?? "",
      empresa: company.trade_name || company.legal_name,
      cnpj: formatarCnpj(company.cnpj) ?? company.cnpj,
    };
    const sucessos = doEmpresa.filter((c) => c.status === "sucesso");
    const erros = doEmpresa.filter((c) => c.status === "erro");
    const abertas = sucessos.flatMap((c) => guiasEmAberto(c.guias));

    for (const c of sucessos) {
      for (const g of guiasEmAberto(c.guias)) {
        const vencimento = dataBr(g.data_limite_pagamento);
        pendencias.push({
          valores: {
            ...base,
            competencia: periodoLegivel(c.periodo),
            tipo: g.tipo ?? "",
            numero: g.numero ?? "",
            situacao: g.situacao ?? "",
            emissao: dataBr(g.data_emissao),
            vencimento,
            atraso: vencimento && vencimento.getTime() < hoje ? Math.round((hoje - vencimento.getTime()) / 86_400_000) : 0,
            valor: g.valor_total,
            consultado: new Date(c.consultado_em),
          },
          pdf: g.guia_pdf_url,
        });
      }
    }

    // Em aberto em qualquer competência pesa mais que erro em outra — o
    // erro continua listado na coluna "Erro da consulta".
    let situacao: string;
    if (doEmpresa.length === 0) situacao = "Não consultada";
    else if (abertas.length > 0) situacao = "EM ABERTO";
    else if (erros.length > 0) situacao = "Erro na consulta";
    else if (sucessos.some((c) => c.guias.length > 0)) situacao = "Em dia";
    else situacao = "Sem guia no período";

    const ultimaConsulta = doEmpresa.reduce<string | null>(
      (max, c) => (!max || c.consultado_em > max ? c.consultado_em : max),
      null,
    );

    const certificado = !validade
      ? "Sem certificado"
      : `${new Date(validade).getTime() < agora.getTime() ? "Vencido em" : "Válido até"} ${new Date(validade).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;

    const row = wsResumo.addRow({
      ...base,
      certificado,
      situacao,
      competencias: doEmpresa.map((c) => periodoLegivel(c.periodo)).join(", "),
      qtd: sucessos.length > 0 ? abertas.length : null,
      valor: sucessos.length > 0 ? abertas.reduce((s, g) => s + (g.valor_total ?? 0), 0) : null,
      guias: sucessos
        .flatMap((c) =>
          c.guias.map(
            (g) =>
              `${periodoLegivel(c.periodo)} ${g.tipo ?? "?"} ${g.situacao ?? "sem situação"}${
                g.data_arrecadacao ? ` em ${g.data_arrecadacao}` : ""
              }${g.valor_total !== null ? ` (R$ ${g.valor_total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })})` : ""}`,
          ),
        )
        .join("; "),
      erro: erros.map((c) => `${periodoLegivel(c.periodo)}: ${c.erro ?? "erro"}`).join("; "),
      consultado: ultimaConsulta ? new Date(ultimaConsulta) : null,
    });
    if (situacao === "EM ABERTO") row.getCell("situacao").font = { bold: true, color: { argb: "FFB91C1C" } };
  }

  // Pendências: maior atraso primeiro.
  pendencias.sort((a, b) => Number(b.valores.atraso) - Number(a.valores.atraso));
  for (const p of pendencias) {
    const row = wsPend.addRow({ ...p.valores, pdf: p.pdf ? { text: "Abrir PDF", hyperlink: p.pdf } : "" });
    if (p.pdf) row.getCell("pdf").font = { color: { argb: "FF1D4ED8" }, underline: true };
  }

  estiloCabecalho(wsPend);
  estiloCabecalho(wsResumo);
  if (pendencias.length === 0) wsPend.addRow({ empresa: "Nenhuma guia de FGTS em aberto nas competências consultadas." });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
