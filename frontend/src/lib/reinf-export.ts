import "server-only";
import ExcelJS from "exceljs";
import { formatarCpfCnpj } from "@/lib/formatters";
import { NATUREZAS, prazoReinf, type EventoReinf } from "@/lib/reinf-core";
import type { EmpresaReinf } from "@/lib/reinf";

const MOEDA = "#,##0.00";
const TRIBUTOS = [
  ["irrf", "IRRF"],
  ["pis", "PIS"],
  ["cofins", "COFINS"],
  ["csll", "CSLL"],
  ["cp", "INSS/CP"],
  ["iss", "ISS"],
] as const;

const STATUS: Record<string, string> = { pendente: "Pendente", enviado: "Enviado", dispensado: "Dispensado" };

function compBr(c: string) {
  const [a, m] = c.split("-");
  return `${m}/${a}`;
}

function regime(r: string | null) {
  return r === "SIMPLES_NACIONAL" ? "Simples Nacional" : r === "LUCRO_PRESUMIDO" ? "Lucro Presumido" : (r ?? "");
}

function registros(eventos: EventoReinf[], temIss: boolean) {
  return [...eventos, ...(temIss ? ["ISS (fora da Reinf)"] : [])].join(", ");
}

function dataBr(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
}

function estiloCabecalho(ws: ExcelJS.Worksheet) {
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function gerarPlanilhaReinf(competencia: string, empresas: EmpresaReinf[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const resumo = wb.addWorksheet("Resumo por empresa");
  resumo.columns = [
    { header: "Empresa", key: "empresa", width: 44 },
    { header: "CNPJ", key: "cnpj", width: 20 },
    { header: "Competência", key: "comp", width: 12 },
    { header: "Regime", key: "regime", width: 17 },
    { header: "Registros Reinf", key: "registros", width: 26 },
    { header: "Notas", key: "notas", width: 8 },
    { header: "Valor serviços", key: "valor", width: 15, style: { numFmt: MOEDA } },
    ...TRIBUTOS.map(([k, r]) => ({ header: r, key: k, width: 12, style: { numFmt: MOEDA } })),
    { header: "Total retido", key: "total", width: 14, style: { numFmt: MOEDA } },
    { header: "Situação", key: "status", width: 12 },
    { header: "Observação", key: "obs", width: 30 },
  ];
  for (const e of empresas) {
    resumo.addRow({
      empresa: e.razaoSocial,
      cnpj: formatarCpfCnpj(e.cnpj),
      comp: compBr(competencia),
      regime: regime(e.regime),
      registros: registros(e.eventos, e.temIss),
      notas: e.notas.filter((n) => !n.ignorar).length,
      valor: e.valorServico,
      ...Object.fromEntries(TRIBUTOS.map(([k]) => [k, e.valores[k] || null])),
      total: e.total,
      status: e.status ? STATUS[e.status] : "Só ISS",
      obs: e.observacao ?? "",
    });
  }
  estiloCabecalho(resumo);

  const notas = wb.addWorksheet("Notas");
  notas.columns = [
    { header: "Empresa (tomadora)", key: "empresa", width: 40 },
    { header: "CNPJ tomadora", key: "cnpjEmp", width: 20 },
    { header: "Competência", key: "comp", width: 12 },
    { header: "Pago em", key: "pago", width: 10 },
    { header: "Emissão", key: "emissao", width: 12 },
    { header: "Nº", key: "numero", width: 12 },
    { header: "Prestador", key: "prestador", width: 40 },
    { header: "CNPJ/CPF prestador", key: "doc", width: 20 },
    { header: "Cód. serviço", key: "ctrib", width: 11 },
    { header: "Valor serviços", key: "valor", width: 14, style: { numFmt: MOEDA } },
    ...TRIBUTOS.map(([k, r]) => ({ header: r, key: k, width: 11, style: { numFmt: MOEDA } })),
    { header: "Total retido", key: "total", width: 13, style: { numFmt: MOEDA } },
    { header: "Registro Reinf", key: "registro", width: 22 },
    { header: "Natureza", key: "natureza", width: 10 },
    { header: "Descrição da natureza", key: "natDesc", width: 36 },
    { header: "Ignorada", key: "ignorada", width: 9 },
    { header: "Alertas", key: "alertas", width: 60 },
  ];
  for (const e of empresas) {
    for (const n of e.notas) {
      notas.addRow({
        empresa: e.razaoSocial,
        cnpjEmp: formatarCpfCnpj(e.cnpj),
        comp: compBr(n.competencia),
        pago: n.mesPagamento ? compBr(n.mesPagamento) : "",
        emissao: dataBr(n.dataEmissao),
        numero: n.numero,
        prestador: n.prestadorNome,
        doc: formatarCpfCnpj(n.prestadorDocumento),
        ctrib: n.cTribNac,
        valor: n.valorServico,
        ...Object.fromEntries(TRIBUTOS.map(([k]) => [k, n.valores[k] || null])),
        total: n.total,
        registro: n.eventos.map((ev) => (ev === "ISS" ? "ISS (fora da Reinf)" : ev)).join(", "),
        natureza: n.natureza ?? "",
        natDesc: n.natureza ? NATUREZAS[n.natureza] : "",
        ignorada: n.ignorar ? "Sim" : "",
        alertas: n.alertas.join(" "),
      });
    }
  }
  estiloCabecalho(notas);

  const info = wb.addWorksheet("Leia-me");
  info.columns = [{ width: 110 }];
  for (const linha of [
    `Central Reinf — competência ${compBr(competencia)} — prazo ${prazoReinf(competencia)} (dia 15 do mês seguinte; confira feriados).`,
    "R-4020: IRRF, PIS, COFINS e CSLL retidos de pessoa jurídica (natureza do rendimento por nota).",
    "R-4010: IRRF retido de pessoa física. R-2010: INSS (CP) retido em cessão de mão de obra/empreitada.",
    "ISS retido é municipal e não vai para a Reinf. Fechamentos: R-2099 e R-4099.",
    "Valores lidos do XML. Desde a NT 007/2026 a nota soma PIS + COFINS + CSLL retidos; aqui foram separados pelas alíquotas 0,65% / 3% / 1%.",
    "R-4010/R-4020 vão no mês do pagamento; sem ajuste na Central, vale a competência da nota.",
  ]) {
    info.addRow([linha]);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const num = (v: number) => (v ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-");

/** Relatório para imprimir/salvar em PDF (mesmo formato do relatório de retenções usado pela equipe + registro Reinf). */
export function gerarRelatorioReinfHtml(
  competencia: string,
  empresas: EmpresaReinf[],
  totais: {
    valores: Record<string, number>;
    total: number;
    notas: number;
    valorServico: number;
    porEvento: Record<EventoReinf, { empresas: number; notas: number; total: number }>;
  },
  geradoEm: Date,
): string {
  const gerado = geradoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  const cab = TRIBUTOS.map(([, r]) => `<th>${r}</th>`).join("");
  const linhasResumo = empresas
    .map(
      (e) => `<tr>
  <td class="t">${esc(e.razaoSocial)}</td><td>${esc(formatarCpfCnpj(e.cnpj))}</td><td>${esc(registros(e.eventos, e.temIss).replace(" (fora da Reinf)", ""))}</td>
  <td class="n">${e.notas.filter((n) => !n.ignorar).length}</td><td class="n">${num(e.valorServico)}</td>
  ${TRIBUTOS.map(([k]) => `<td class="n">${num(e.valores[k])}</td>`).join("")}
  <td class="n b">${num(e.total)}</td><td>${e.status ? STATUS[e.status] : "Só ISS"}</td></tr>`,
    )
    .join("");

  const blocos = empresas
    .map((e) => {
      const linhas = e.notas
        .map(
          (n) => `<tr class="${n.ignorar ? "ign" : ""}">
  <td>${dataBr(n.dataEmissao)}</td><td>${esc(n.numero)}</td><td class="t">${esc(n.prestadorNome)}</td><td>${esc(formatarCpfCnpj(n.prestadorDocumento))}</td>
  <td class="n">${num(n.valorServico)}</td>${TRIBUTOS.map(([k]) => `<td class="n">${num(n.valores[k])}</td>`).join("")}
  <td class="n b">${num(n.total)}</td><td>${esc(n.eventos.join(", "))}</td><td>${esc(n.natureza ?? "")}</td></tr>${
    n.alertas.length || n.ignorar
      ? `<tr class="al"><td colspan="15">${n.ignorar ? "Ignorada pela equipe. " : ""}${esc(n.alertas.join(" "))}</td></tr>`
      : ""
  }`,
        )
        .join("");
      return `<h3>${esc(e.razaoSocial)} — ${esc(formatarCpfCnpj(e.cnpj))}</h3>
<table><thead><tr><th>Emissão</th><th>Nº</th><th>Prestador</th><th>CNPJ/CPF</th><th>Valor serv.</th>${cab}<th>Total retido</th><th>Registro</th><th>Natureza</th></tr></thead>
<tbody>${linhas}<tr class="tot"><td colspan="4">TOTAL ${e.notas.filter((n) => !n.ignorar).length} nota(s)</td><td class="n">${num(e.valorServico)}</td>${TRIBUTOS.map(([k]) => `<td class="n">${num(e.valores[k])}</td>`).join("")}<td class="n">${num(e.total)}</td><td colspan="2"></td></tr></tbody></table>`;
    })
    .join("");

  const ev = (["R-4020", "R-4010", "R-2010", "ISS"] as EventoReinf[])
    .map((k) => {
      const t = totais.porEvento[k];
      return `<td><b>${k === "ISS" ? "ISS retido (fora da Reinf)" : k}</b><br>${t.empresas} empresa(s) · ${t.notas} nota(s)<br>R$ ${num(t.total)}</td>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Reinf ${compBr(competencia)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color: #111; margin: 16px; }
h1 { font-size: 20px; color: #1e3a5f; margin: 0 0 4px; } h2 { font-size: 14px; color: #1e3a5f; margin: 18px 0 6px; }
h3 { font-size: 11px; color: #1e3a5f; font-style: italic; margin: 14px 0 4px; break-after: avoid; }
.sub { color: #444; margin-bottom: 2px; } .min { color: #777; font-size: 8.5px; }
table { width: 100%; border-collapse: collapse; margin-bottom: 4px; } th, td { border: 1px solid #ccd3dd; padding: 3px 4px; }
th { background: #dbe7f5; text-align: left; font-size: 9px; } td.n { text-align: right; white-space: nowrap; } td.b { font-weight: bold; }
td.t { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
tr.tot td { font-weight: bold; background: #f2f5f9; } tr.ign td { color: #999; text-decoration: line-through; }
tr.al td { color: #a15c00; border-top: none; font-size: 8.5px; } table.ev td { width: 25%; vertical-align: top; }
tr { break-inside: avoid; } .rod { margin-top: 10px; color: #666; font-size: 8.5px; }
@media print { body { margin: 0; } }
</style></head><body>
<h1>Central Reinf — retenções nas notas fiscais de serviço recebidas</h1>
<div class="sub">Competência: <b>${compBr(competencia)}</b> | ${empresas.length} empresa(s) | ${totais.notas} nota(s) | prazo da Reinf: ${prazoReinf(competencia)} | gerado em ${esc(gerado)}</div>
<div class="min">Somente notas com retenção. Notas ignoradas pela equipe aparecem riscadas e não entram nos totais.</div>
<h2>Registros da Reinf</h2>
<table class="ev"><tr>${ev}</tr></table>
<h2>Totais por tipo de retenção</h2>
<table><thead><tr><th>Total retido</th>${cab}<th>Notas c/ retenção</th><th>Valor dos serviços</th></tr></thead>
<tbody><tr><td class="n b">${num(totais.total)}</td>${TRIBUTOS.map(([k]) => `<td class="n">${num(totais.valores[k])}</td>`).join("")}<td class="n">${totais.notas}</td><td class="n">${num(totais.valorServico)}</td></tr></tbody></table>
<h2>Resumo por empresa</h2>
<table><thead><tr><th>Empresa</th><th>CNPJ</th><th>Registros</th><th>Notas</th><th>Valor serv.</th>${cab}<th>Total retido</th><th>Situação</th></tr></thead>
<tbody>${linhasResumo}<tr class="tot"><td colspan="3">TOTAL</td><td class="n">${totais.notas}</td><td class="n">${num(totais.valorServico)}</td>${TRIBUTOS.map(([k]) => `<td class="n">${num(totais.valores[k])}</td>`).join("")}<td class="n">${num(totais.total)}</td><td></td></tr></tbody></table>
<h2>Notas recebidas de cada empresa</h2>
${blocos}
<div class="rod">Valores lidos do XML de cada nota. Desde a NT 007/2026 a nota informa PIS + COFINS + CSLL retidos somados; aqui foram separados pelas alíquotas (0,65% / 3% / 1%), como a Reinf exige. R-4010/R-4020 vão no mês do pagamento (sem ajuste, a competência da nota). ISS retido é municipal e não entra na Reinf.</div>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}
