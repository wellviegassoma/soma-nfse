#!/usr/bin/env node
// Fechamento do Lucro Presumido — gera/atualiza a planilha única de todas as empresas do Lucro Presumido.
//
// Uso (na pasta frontend):  npm run fechamento:lp                [-- --ano 2026] [-- --saida "C:\...\arquivo.xlsx"]
//
// Fontes: notas (dps + notas_distribuidas) com equiparação hospitalar por nota, retenções das notas
// (IRRF, CSLL, PIS, COFINS e ISS retido) e o cadastro da empresa (ISS, apuração mensal/trimestral).
// O que foi digitado na planilha (vendas, outras receitas, receita sem nota, compensação, DARF pago,
// observação, parâmetros da aba Empresas) é mantido ao atualizar. Precisa do Excel para os gráficos.
/* eslint-disable @typescript-eslint/no-require-imports -- script Node avulso (CommonJS), fora do bundle do Next */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const ExcelJS = require("exceljs");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");

const DIR = __dirname;
const FRONT = path.resolve(DIR, "..", "..");
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ANO = Number(arg("--ano") || new Date().getFullYear());
const OUT = path.resolve(arg("--saida") || path.join(os.homedir(), "Documents", "ClaudeCode", "fechamento-lp", `Fechamento Lucro Presumido ${ANO}.xlsx`));
const DATA_GERACAO = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const env = Object.fromEntries(fs.readFileSync(path.join(FRONT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function todos(q) { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; }
const lotes = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const dt = (y, m) => new Date(Date.UTC(y, m - 1, 1));
const r2 = (x) => Math.round(x * 100) / 100;

// parâmetros padrão (Lei 9.249/95 e 9.718/98; planilha 122-LP)
const P = { irServ: 0.32, csServ: 0.32, irHosp: 0.08, csHosp: 0.12, irVend: 0.08, csVend: 0.12, IRPJ: 0.15, ADIC: 0.10, LIM_TRI: 60000, LIM_MES: 20000, CSLL: 0.09, PIS: 0.0065, COFINS: 0.03, MIN_DARF: 10 };
// contas contábeis (planilha 122-LP): retenção (ativo), passivo, despesa
const CONTAS = [["IRPJ", 357, 2214, 4740], ["CSLL", 560, 2168, 4747], ["PIS", 546, 2140, 3119], ["COFINS", 553, 2147, 3126], ["ISS", 5000, 2175, 3112]];

async function carregarSistema() {
  const empresas = await todos(() => sb.from("companies").select("id, codigo_cliente, legal_name, trade_name, cnpj, municipality_name, irpj_csll_apuracao_mensal, iss_tipo, iss_aliquota_padrao, iss_valor_fixo_profissional, iss_quantidade_profissionais, equiparacao_hospitalar").eq("ativa", true).eq("tax_regime", "LUCRO_PRESUMIDO").not("codigo_cliente", "is", null).order("id"));
  const ids = empresas.map((c) => c.id);
  const ini = `${ANO}-01-01`, fim = `${ANO + 1}-01-01`;
  let dps = [], nd = [], man = [];
  for (const ch of lotes(ids, 30)) {
    dps.push(...await todos(() => sb.from("dps").select("id, company_id, valor, status, data_competencia, nfse(status, access_key)").in("company_id", ch).gte("data_competencia", ini).lt("data_competencia", fim).order("id")));
    nd.push(...await todos(() => sb.from("notas_distribuidas").select("id, company_id, chave_acesso, valor_servico, competencia, cancelada, tipo_retencao_issqn, valor_issqn, equiparacao_hospitalar, valor_ret_irrf, valor_ret_csll, valor_pis, valor_cofins").in("company_id", ch).eq("direcao", "saida").gte("competencia", ini).lt("competencia", fim).order("id")));
    man.push(...await todos(() => sb.from("receita_mensal_manual").select("company_id, competencia, valor").in("company_id", ch).gte("competencia", `${ANO}-01`).lte("competencia", `${ANO}-12`).order("competencia")));
  }
  // tpRetPisCofins (XML) só das notas com CSRF: 3 = PIS/COFINS/CSLL retidos (vRetCSLL soma os três)
  const comCsrf = nd.filter((n) => Number(n.valor_ret_csll) > 0).map((n) => n.id);
  const tpRet = new Map();
  for (const ch of lotes(comCsrf, 200)) {
    const { data, error } = await sb.from("notas_distribuidas").select("id, xml").in("id", ch);
    if (error) throw error;
    for (const x of data) tpRet.set(x.id, (x.xml || "").match(/<tpRetPisCofins>(\d)<\/tpRetPisCofins>/)?.[1] ?? null);
  }
  const vazio = () => ({ geral: 0, hosp: 0, issRetRec: 0, issRet: 0, irrf: 0, csll: 0, pis: 0, cofins: 0, notas: 0 });
  const rec = {}; const get = (cid, comp) => { rec[cid] ??= {}; return (rec[cid][comp] ??= vazio()); };
  const vistos = new Set(), porChave = new Map(nd.filter((n) => n.chave_acesso).map((n) => [n.chave_acesso, n]));
  for (const d of dps) {
    if (d.status !== "ACCEPTED") continue;
    const nf = Array.isArray(d.nfse) ? d.nfse[0] : d.nfse; const ch = nf?.access_key;
    if (ch && porChave.has(ch)) continue; // a distribuída (com retenções e flag hospitalar) entra abaixo
    if (ch) vistos.add(ch);
    if (nf?.status === "CANCELADA") continue;
    const a = get(d.company_id, d.data_competencia.slice(0, 7)); a.geral += Number(d.valor); a.notas++;
  }
  for (const n of nd) {
    if (n.chave_acesso && vistos.has(n.chave_acesso)) continue; if (n.chave_acesso) vistos.add(n.chave_acesso);
    if (n.cancelada) continue;
    const v = Number(n.valor_servico || 0), a = get(n.company_id, String(n.competencia).slice(0, 7));
    a[n.equiparacao_hospitalar ? "hosp" : "geral"] += v; a.notas++;
    if (n.tipo_retencao_issqn === 2 || n.tipo_retencao_issqn === 3) { a.issRetRec += v; a.issRet += Number(n.valor_issqn || 0); }
    a.irrf += Number(n.valor_ret_irrf || 0);
    const csrf = Number(n.valor_ret_csll || 0);
    if (csrf > 0) {
      const tp = tpRet.get(n.id), pis = Number(n.valor_pis || 0), cof = Number(n.valor_cofins || 0);
      if (tp === "3" || (tp == null && csrf > pis + cof + 0.009)) { a.pis += pis; a.cofins += cof; a.csll += Math.max(0, csrf - pis - cof); }
      else if (tp === "1") { a.pis += pis; a.cofins += cof; a.csll += csrf; }
      else a.csll += csrf;
    }
  }
  const manual = {}; for (const m of man) (manual[m.company_id] ??= {})[m.competencia] = Number(m.valor);
  console.log(`Sistema: ${empresas.length} empresas do Lucro Presumido, ${nd.length + dps.length} notas de ${ANO}.`);
  return { empresas, rec, manual };
}

async function lerPlanilhaAnterior() {
  const prev = { linhas: new Map(), empresas: new Map() };
  if (!fs.existsSync(OUT)) return prev;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(OUT);
  const val = (c) => { const v = c.value; if (v == null || v === "") return null; if (typeof v === "object" && !(v instanceof Date)) return v.result ?? null; return v; };
  const ws = wb.getWorksheet("Fechamento");
  if (ws) for (let r = 6; r <= ws.rowCount; r++) {
    const cod = val(ws.getCell(`B${r}`)), d = val(ws.getCell(`D${r}`)); if (!cod || !(d instanceof Date)) continue;
    const o = {}; for (const c of ["F", "G", "H", "I", "AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "BC", "BD"]) o[c] = val(ws.getCell(`${c}${r}`));
    prev.linhas.set(`${cod}|${ym(d.getUTCFullYear(), d.getUTCMonth() + 1)}`, o);
  }
  const we = wb.getWorksheet("Empresas");
  if (we) for (let r = 2; r <= we.rowCount; r++) { const cod = val(we.getCell(`A${r}`)); if (!cod) continue; const o = {}; for (const c of ["E", "F", "G", "H", "I", "J", "K", "L", "M", "N"]) o[c] = val(we.getCell(`${c}${r}`)); prev.empresas.set(cod, o); }
  console.log(`Planilha anterior: ${prev.linhas.size} linhas lidas (o que foi digitado será mantido).`);
  return prev;
}

async function main() {
  const trava = path.join(path.dirname(OUT), "~$" + path.basename(OUT));
  if (fs.existsSync(trava)) throw new Error(`A planilha está aberta no Excel (${path.basename(OUT)}). Feche e rode de novo.`);
  const sis = await carregarSistema();
  const prev = await lerPlanilhaAnterior();
  const logoBuf = await sharp(path.join(FRONT, "public", "soma-logo.png")).trim().png().toBuffer();
  const iconBuf = await sharp(path.join(FRONT, "public", "soma-icon.png")).trim().png().toBuffer();
  const empresas = sis.empresas.slice().sort((a, b) => a.codigo_cliente.localeCompare(b.codigo_cliente));

  // ---------- parâmetros por empresa e linhas ----------
  const par = empresas.map((e) => {
    const p = prev.empresas.get(e.codigo_cliente) || {};
    const fixo = e.iss_tipo === "FIXO";
    return {
      e, mensal: p.E ?? (e.irpj_csll_apuracao_mensal ? "Sim" : "Não"),
      irServ: p.F ?? P.irServ, csServ: p.G ?? P.csServ, irHosp: p.H ?? P.irHosp, csHosp: p.I ?? P.csHosp, irVend: p.J ?? P.irVend, csVend: p.K ?? P.csVend,
      issTipo: p.L ?? (fixo ? "Fixo" : "Percentual"), issAliq: p.M ?? (e.iss_aliquota_padrao ?? 0.02),
      issFixo: p.N ?? (fixo && e.iss_valor_fixo_profissional ? r2(Number(e.iss_valor_fixo_profissional) * Number(e.iss_quantidade_profissionais || 1)) : 0),
    };
  });
  const fech = [];
  for (const pe of par) {
    const e = pe.e, cod = e.codigo_cliente, rec = sis.rec[e.id] || {}, man = sis.manual[e.id] || {};
    for (let m = 1; m <= 12; m++) {
      const k = ym(ANO, m), p = prev.linhas.get(`${cod}|${k}`) || {}, a = rec[k];
      const row = { cod, nome: e.trade_name || e.legal_name, y: ANO, m, d: dt(ANO, m), geral: 0, hosp: 0, vendas: p.H ?? null, outras: p.I ?? null, issRetRec: 0, issRet: 0, irrf: 0, csll: 0, pis: 0, cofins: 0, fonte: "", ent: p, obs: p.BC ?? null };
      const digitado = (typeof p.F === "number" || typeof p.G === "number") && p.BD && !/^(Notas no sistema|Receita manual)/.test(p.BD);
      if (a) { row.issRetRec = r2(a.issRetRec); row.issRet = r2(a.issRet); row.irrf = r2(a.irrf); row.csll = r2(a.csll); row.pis = r2(a.pis); row.cofins = r2(a.cofins); }
      if (digitado) { row.geral = p.F || 0; row.hosp = p.G || 0; row.fonte = p.BD; }
      else if (man[k] != null) { row.geral = man[k]; row.fonte = "Receita manual (sistema)"; }
      else if (a) { row.geral = r2(a.geral); row.hosp = r2(a.hosp); row.fonte = "Notas no sistema"; }
      fech.push(row);
    }
  }

  // ---------- planilha ----------
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOMA Contabilidade Integrada"; wb.calcProperties.fullCalcOnLoad = true;
  const C = { navy: "FF1F3550", navy2: "FF2C4A6B", navyDeep: "FF101A2C", gold: "FFC9A13B", goldPale: "FFF6EEDB", ink: "FF1B2233", gray: "FF6B7280", line: "FFD9DEE5", bg: "FFF5F6F8", white: "FFFFFFFF", slate: "FF4A5D78", green: "FF2E7D5B", greenSoft: "FFE3F1EA", red: "FFB42318", redSoft: "FFFBE4E2", amber: "FF9A6B00", amberSoft: "FFFFF3D6" };
  const FONT = "Segoe UI";
  const moeda = '#,##0.00;[Red]-#,##0.00', moeda0 = 'R$ #,##0;[Red]-R$ #,##0', pct = '0.00%', pct1 = '0.0%', mesFmt = 'mmm/yy', mesLongo = 'mmmm "de" yyyy';
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const thin = (argb = C.line) => ({ style: "thin", color: { argb } });
  const entrada = fill(C.goldPale);
  const logoId = wb.addImage({ buffer: logoBuf, extension: "png" }), iconId = wb.addImage({ buffer: iconBuf, extension: "png" });
  const ABAS = {}; for (const nome of ["Painel", "Fechamento", "Empresa", "Contabilização", "Empresas", "Tabelas", "Como usar"]) ABAS[nome] = wb.addWorksheet(nome, { views: [{ showGridLines: false }] });
  ABAS["Painel"].properties.tabColor = { argb: C.gold }; for (const n of ["Fechamento", "Empresa"]) ABAS[n].properties.tabColor = { argb: C.navy };
  for (const n of ["Contabilização", "Empresas"]) ABAS[n].properties.tabColor = { argb: C.slate }; for (const n of ["Tabelas", "Como usar"]) ABAS[n].properties.tabColor = { argb: "FF9CA3AF" };
  const banner = (ws, titulo, subtitulo, ultimaCol) => {
    ws.getRow(1).height = 30; ws.getRow(2).height = 22; ws.getRow(3).height = 22;
    ws.addImage(iconId, { tl: { col: 0.25, row: 0.25 }, ext: { width: 46, height: 50 } });
    const t = ws.getCell("C1"); t.value = titulo; t.font = { name: FONT, size: 18, bold: true, color: { argb: C.navy } }; t.alignment = { vertical: "middle" };
    const s = ws.getCell("C2"); s.value = subtitulo; s.font = { name: FONT, size: 10, color: { argb: C.gold }, bold: true }; s.alignment = { vertical: "middle" };
    for (let c = 1; c <= ultimaCol; c++) ws.getCell(3, c).border = { bottom: { style: "medium", color: { argb: C.gold } } };
  };
  const cabTabela = (ws, row, cor = C.navy, fonteCor = C.white) => { const r = ws.getRow(row); r.eachCell({ includeEmpty: false }, (c) => { c.font = { name: FONT, bold: true, size: 9, color: { argb: fonteCor } }; c.fill = fill(cor); c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = { bottom: thin(C.gold) }; }); r.height = 34; };
  const corpo = (ws, r1, r2_, c1, c2) => { for (let r = r1; r <= r2_; r++) for (let c = c1; c <= c2; c++) { const cell = ws.getCell(r, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; } };
  const sitStyle = (txt, bg, fc) => ({ type: "containsText", operator: "containsText", text: txt, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: bg } }, font: { color: { argb: fc }, bold: true } } });

  // ===== Tabelas =====
  const wt = ABAS["Tabelas"];
  banner(wt, "Parâmetros do Lucro Presumido", "Alíquotas, limites e contas contábeis — altere aqui e tudo recalcula", 8);
  const T = [["IRPJ — alíquota", P.IRPJ, pct], ["IRPJ — adicional", P.ADIC, pct], ["Adicional — limite trimestral de base", P.LIM_TRI, moeda], ["Adicional — limite mensal de base", P.LIM_MES, moeda], ["CSLL — alíquota", P.CSLL, pct], ["PIS — alíquota (cumulativo)", P.PIS, pct], ["COFINS — alíquota (cumulativo)", P.COFINS, pct], ["DARF mínimo (abaixo disso acumula)", P.MIN_DARF, moeda]];
  wt.getRow(5).values = ["Parâmetro", "Valor"]; cabTabela(wt, 5);
  T.forEach(([k, v, f], i) => { wt.getCell(`A${6 + i}`).value = k; const c = wt.getCell(`B${6 + i}`); c.value = v; c.numFmt = f; c.fill = entrada; });
  corpo(wt, 6, 13, 1, 2); for (let i = 0; i < T.length; i++) wt.getCell(`B${6 + i}`).fill = entrada;
  const TB = { IRPJ: "Tabelas!$B$6", ADIC: "Tabelas!$B$7", LIM_TRI: "Tabelas!$B$8", LIM_MES: "Tabelas!$B$9", CSLL: "Tabelas!$B$10", PIS: "Tabelas!$B$11", COFINS: "Tabelas!$B$12", MIN: "Tabelas!$B$13" };
  wt.getRow(16).values = ["Tributo", "Conta retenção (ativo)", "Conta passivo", "Conta despesa"]; cabTabela(wt, 16, C.slate);
  CONTAS.forEach(([t, a, b, c], i) => { wt.getRow(17 + i).values = [t, a, b, c]; for (let k = 2; k <= 4; k++) wt.getCell(17 + i, k).fill = entrada; });
  corpo(wt, 17, 21, 1, 4); for (let i = 0; i < 5; i++) for (let k = 2; k <= 4; k++) wt.getCell(17 + i, k).fill = entrada;
  const CT = Object.fromEntries(CONTAS.map(([t], i) => [t, { ret: `Tabelas!$B$${17 + i}`, pas: `Tabelas!$C$${17 + i}`, desp: `Tabelas!$D$${17 + i}` }]));
  wt.getColumn(1).width = 38; wt.getColumn(2).width = 18; wt.getColumn(3).width = 16; wt.getColumn(4).width = 16;

  // ===== Empresas =====
  const we = ABAS["Empresas"];
  const ecols = [["Código", 9], ["Empresa", 46], ["CNPJ", 19], ["Município", 18], ["IRPJ/CSLL mensal?", 10], ["Presunção IRPJ serviços", 10], ["Presunção CSLL serviços", 10], ["Presunção IRPJ hospitalar", 10], ["Presunção CSLL hospitalar", 10], ["Presunção IRPJ vendas", 10], ["Presunção CSLL vendas", 10], ["ISS tipo", 11], ["ISS alíquota", 9], ["ISS fixo mensal", 12]];
  ecols.forEach(([h, wd], i) => { we.getColumn(i + 1).width = wd; we.getCell(1, i + 1).value = h; }); cabTabela(we, 1);
  par.forEach((p, i) => {
    const r = i + 2, e = p.e;
    we.getRow(r).values = [e.codigo_cliente, e.trade_name || e.legal_name, e.cnpj ? e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "", e.municipality_name, p.mensal, p.irServ, p.csServ, p.irHosp, p.csHosp, p.irVend, p.csVend, p.issTipo, p.issAliq, p.issFixo];
  });
  const NE = par.length + 1;
  corpo(we, 2, NE, 1, 14);
  for (let r = 2; r <= NE; r++) { for (let c = 5; c <= 14; c++) we.getCell(r, c).fill = entrada; for (let c = 6; c <= 11; c++) we.getCell(r, c).numFmt = "0%"; we.getCell(r, 13).numFmt = pct; we.getCell(r, 14).numFmt = moeda;
    we.getCell(r, 5).dataValidation = { type: "list", allowBlank: false, formulae: ['"Sim,Não"'] }; we.getCell(r, 12).dataValidation = { type: "list", allowBlank: false, formulae: ['"Percentual,Fixo"'] }; }
  we.views = [{ state: "frozen", ySplit: 1, xSplit: 2, showGridLines: false }]; we.autoFilter = `A1:N${NE}`;

  // ===== Fechamento =====
  const w = ABAS["Fechamento"];
  const HDR = 5, R0 = 6, N = R0 + fech.length - 1;
  const cols = [
    ["A", "Chave", 4, "id"], ["B", "Código", 8, "id"], ["C", "Empresa", 34, "id"], ["D", "Compet.", 9, "id"], ["E", "IRPJ/CSLL mensal?", 8, "id"],
    ["F", "Serviços", 13, "rec"], ["G", "Serviços hospitalares", 13, "rec"], ["H", "Vendas", 11, "rec"], ["I", "Outras receitas", 11, "rec"], ["J", "Receita total", 13, "rec"], ["K", "Receita c/ ISS retido", 12, "rec"],
    ["L", "IRRF", 10, "ret"], ["M", "CSLL", 10, "ret"], ["N", "PIS", 10, "ret"], ["O", "COFINS", 10, "ret"], ["P", "ISS retido", 10, "ret"],
    ["Q", "Base IRPJ", 12, "irpj"], ["R", "IRPJ 15%", 11, "irpj"], ["S", "Base do trimestre (acum.)", 12, "irpj"], ["T", "Adicional 10%", 10, "irpj"], ["U", "IRPJ do mês", 11, "irpj"], ["V", "IRPJ devido no período", 11, "irpj"],
    ["W", "Base CSLL", 12, "csll"], ["X", "CSLL do mês", 11, "csll"], ["Y", "CSLL devida no período", 11, "csll"],
    ["Z", "PIS", 10, "pc"], ["AA", "PIS devido", 10, "pc"], ["AB", "COFINS", 10, "pc"], ["AC", "COFINS devida", 10, "pc"], ["AD", "Base ISS", 12, "pc"], ["AE", "ISS", 10, "pc"],
    ["AF", "IRPJ", 11, "guia"], ["AG", "CSLL", 11, "guia"], ["AH", "PIS", 10, "guia"], ["AI", "COFINS", 10, "guia"], ["AJ", "ISS", 10, "guia"], ["AK", "Total das guias", 12, "guia"],
    ["AL", "Saldo < mínimo IRPJ", 8, "acum"], ["AM", "Saldo < mínimo CSLL", 8, "acum"], ["AN", "Saldo < mínimo PIS", 8, "acum"], ["AO", "Saldo < mínimo COFINS", 8, "acum"],
    ["AP", "IRPJ comp.", 10, "pago"], ["AQ", "IRPJ DARF pago", 10, "pago"], ["AR", "CSLL comp.", 10, "pago"], ["AS", "CSLL DARF pago", 10, "pago"], ["AT", "PIS comp.", 10, "pago"], ["AU", "PIS DARF pago", 10, "pago"], ["AV", "COFINS comp.", 10, "pago"], ["AW", "COFINS DARF pago", 10, "pago"], ["AX", "ISS pago", 10, "pago"],
    ["AY", "Saldo a pagar", 12, "res"], ["AZ", "Situação", 15, "res"], ["BA", "Impostos da competência", 12, "res"], ["BB", "Carga tributária", 8, "res"],
    ["BC", "Observação", 28, "obs"], ["BD", "Fonte da receita", 18, "obs"], ["BE", "Ordem guia", 5, "obs"], ["BF", "Linha empresa", 5, "obs"],
  ];
  const GRUPO = { id: ["Empresa", C.navy, C.white], rec: ["Receita do mês (vendas e outras: digite)", C.gold, C.navyDeep], ret: ["Retenções nas notas", C.slate, C.white], irpj: ["IRPJ", C.navy2, C.white], csll: ["CSLL", C.navy2, C.white], pc: ["PIS · COFINS · ISS", C.slate, C.white], guia: ["Guias a emitir", C.navy, C.white], acum: ["Saldo abaixo do mínimo", "FF8A94A6", C.white], pago: ["Compensação e pagamento (digite)", C.gold, C.navyDeep], res: ["Resultado", C.navy, C.white], obs: ["Controle", "FF8A94A6", C.white] };
  cols.forEach(([c, , wd]) => (w.getColumn(c).width = wd));
  banner(w, `Fechamento do Lucro Presumido ${ANO}`, "SOMA Contabilidade Integrada · uma linha por empresa e mês — filtre por Competência ou Código", 58);
  for (let gi = 0; gi < cols.length;) {
    const g = cols[gi][3]; let gj = gi; while (gj + 1 < cols.length && cols[gj + 1][3] === g) gj++;
    const [titulo, cor, fc] = GRUPO[g];
    if (gj > gi) w.mergeCells(`${cols[gi][0]}4:${cols[gj][0]}4`);
    const cell = w.getCell(`${cols[gi][0]}4`); cell.value = titulo; cell.font = { name: FONT, bold: true, size: 9, color: { argb: fc } }; cell.alignment = { horizontal: "center", vertical: "middle" };
    for (let k = gi; k <= gj; k++) { w.getCell(`${cols[k][0]}4`).fill = fill(cor); const h = w.getCell(`${cols[k][0]}${HDR}`); h.value = cols[k][1]; h.font = { name: FONT, bold: true, size: 9, color: { argb: fc } }; h.fill = fill(cor); h.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; h.border = { bottom: { style: "medium", color: { argb: C.gold } }, right: thin("FFFFFFFF") }; }
    gi = gj + 1;
  }
  w.getRow(4).height = 20; w.getRow(HDR).height = 40;
  const SEL = "Painel!$C$5";
  const EMP = (col, n) => `INDEX(Empresas!$${col}$2:$${col}$${NE},$BF${n})`;
  const moedaCols = ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "AY", "BA"];
  // período: mensal = todo mês; trimestral = mês 3, 6, 9, 12
  const ehPeriodo = (n) => `OR($E${n}="Sim",MOD(MONTH($D${n}),3)=0)`;
  const anterior = (col, n) => `IF($E${n}="Sim",IF(MONTH($D${n})>1,${col}${n - 1},0),IF(MONTH($D${n})>3,${col}${n - 3},0))`;
  const anteriorMes = (col, n) => `IF(MONTH($D${n})>1,${col}${n - 1},0)`;
  fech.forEach((r, i) => {
    const n = R0 + i, set = (c, v) => { w.getCell(`${c}${n}`).value = v; }, p = r.ent;
    const iEmp = par.findIndex((x) => x.e.codigo_cliente === r.cod) + 1;
    set("BF", { formula: `MATCH($B${n},Empresas!$A$2:$A$${NE},0)`, result: iEmp });
    set("A", { formula: `B${n}&"|"&(YEAR(D${n})*100+MONTH(D${n}))`, result: `${r.cod}|${r.y * 100 + r.m}` });
    set("B", r.cod); set("C", { formula: EMP("B", n), result: r.nome }); set("D", r.d); set("E", { formula: EMP("E", n), result: par[iEmp - 1].mensal });
    set("F", r.geral || null); set("G", r.hosp || null); set("H", r.vendas); set("I", r.outras);
    set("J", { formula: `F${n}+G${n}+H${n}` }); set("K", r.issRetRec || null);
    set("L", r.irrf || null); set("M", r.csll || null); set("N", r.pis || null); set("O", r.cofins || null); set("P", r.issRet || null);
    set("Q", { formula: `F${n}*${EMP("F", n)}+G${n}*${EMP("H", n)}+H${n}*${EMP("J", n)}+I${n}` });
    set("R", { formula: `Q${n}*${TB.IRPJ}` });
    set("S", { formula: `IF($E${n}="Sim",Q${n},SUMIFS($Q$${R0}:$Q$${N},$B$${R0}:$B$${N},$B${n},$D$${R0}:$D$${N},">="&DATE(YEAR($D${n}),INT((MONTH($D${n})-1)/3)*3+1,1),$D$${R0}:$D$${N},"<="&$D${n}))` });
    set("T", { formula: `IF($E${n}="Sim",MAX(0,Q${n}-${TB.LIM_MES})*${TB.ADIC},IF(MOD(MONTH($D${n}),3)=0,MAX(0,S${n}-${TB.LIM_TRI})*${TB.ADIC},0))` });
    set("U", { formula: `R${n}+T${n}` });
    const somaTri = (c) => `SUMIFS($${c}$${R0}:$${c}$${N},$B$${R0}:$B$${N},$B${n},$D$${R0}:$D$${N},">="&DATE(YEAR($D${n}),MONTH($D${n})-2,1),$D$${R0}:$D$${N},"<="&$D${n})`;
    set("V", { formula: `IF($E${n}="Sim",MAX(0,U${n}-L${n}),IF(MOD(MONTH($D${n}),3)=0,MAX(0,${somaTri("U")}-${somaTri("L")}),0))` });
    set("W", { formula: `F${n}*${EMP("G", n)}+G${n}*${EMP("I", n)}+H${n}*${EMP("K", n)}+I${n}` });
    set("X", { formula: `W${n}*${TB.CSLL}` });
    set("Y", { formula: `IF($E${n}="Sim",MAX(0,X${n}-M${n}),IF(MOD(MONTH($D${n}),3)=0,MAX(0,${somaTri("X")}-${somaTri("M")}),0))` });
    set("Z", { formula: `J${n}*${TB.PIS}` }); set("AA", { formula: `MAX(0,Z${n}-N${n})` });
    set("AB", { formula: `J${n}*${TB.COFINS}` }); set("AC", { formula: `MAX(0,AB${n}-O${n})` });
    set("AD", { formula: `MAX(0,F${n}+G${n}-K${n})` });
    set("AE", { formula: `IF(${EMP("L", n)}="Fixo",IF(J${n}+I${n}>0,${EMP("N", n)},0),AD${n}*${EMP("M", n)})` });
    // guias: devido + saldo acumulado abaixo do mínimo; abaixo do mínimo não emite e acumula para o próximo período
    const guia = (dev, acum, ant) => [`IF(${dev}+${ant}>=${TB.MIN},${dev}+${ant},0)`, `IF(${dev}+${ant}<${TB.MIN},${dev}+${ant},0)`];
    const [gIr, aIr] = guia(`V${n}`, "AL", anterior("AL", n)); const [gCs, aCs] = guia(`Y${n}`, "AM", anterior("AM", n));
    const [gPi, aPi] = guia(`AA${n}`, "AN", anteriorMes("AN", n)); const [gCo, aCo] = guia(`AC${n}`, "AO", anteriorMes("AO", n));
    set("AF", { formula: `IF(${ehPeriodo(n)},ROUND(${gIr},2),0)` }); set("AL", { formula: `IF(${ehPeriodo(n)},${aIr},0)` });
    set("AG", { formula: `IF(${ehPeriodo(n)},ROUND(${gCs},2),0)` }); set("AM", { formula: `IF(${ehPeriodo(n)},${aCs},0)` });
    set("AH", { formula: `ROUND(${gPi},2)` }); set("AN", { formula: aPi });
    set("AI", { formula: `ROUND(${gCo},2)` }); set("AO", { formula: aCo });
    set("AJ", { formula: `ROUND(AE${n},2)` });
    set("AK", { formula: `SUM(AF${n}:AJ${n})` });
    for (const c of ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX"]) set(c, typeof p[c] === "number" ? p[c] : null);
    set("AY", { formula: `AK${n}-SUM(AP${n}:AX${n})` });
    set("AZ", { formula: `IF(AND(J${n}+I${n}=0,AK${n}=0),"Sem movimento",IF(AK${n}=0,"Sem guia no mês",IF(AY${n}<=0.05,"Quitado","A pagar")))` });
    set("BA", { formula: `U${n}+X${n}+Z${n}+AB${n}+AE${n}` });
    set("BB", { formula: `IF(J${n}+I${n}>0,BA${n}/(J${n}+I${n}),0)` });
    set("BC", r.obs); set("BD", r.fonte);
    set("BE", { formula: `IF(AND(D${n}=${SEL},AY${n}>0.05),AY${n}+ROW()/1000000000,"")` });
    for (let c = 1; c <= 58; c++) { const cell = w.getCell(n, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin(r.m === 12 ? "FFB8C2D1" : "FFEEF0F3") }; }
    for (const c of moedaCols) w.getCell(`${c}${n}`).numFmt = moeda;
    w.getCell(`D${n}`).numFmt = mesFmt; w.getCell(`BB${n}`).numFmt = pct1;
    for (const c of ["F", "G", "H", "I", "AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX", "BC"]) w.getCell(`${c}${n}`).fill = entrada;
    for (const c of ["J", "AK", "AY"]) w.getCell(`${c}${n}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.navy } };
    for (const c of ["B", "E", "AZ"]) w.getCell(`${c}${n}`).alignment = { horizontal: "center" };
  });
  w.addConditionalFormatting({ ref: `AZ${R0}:AZ${N}`, rules: [sitStyle("Quitado", C.greenSoft, C.green), sitStyle("A pagar", C.amberSoft, C.amber), sitStyle("Sem guia", "FFEAF0F7", C.slate), sitStyle("Sem movimento", "FFF1F2F4", C.gray)] });
  for (const c of ["A", "Q", "R", "S", "T", "W", "AD", "AL", "AM", "AN", "AO", "BE", "BF"]) w.getColumn(c).outlineLevel = 1;
  for (const c of ["A", "BE", "BF"]) w.getColumn(c).hidden = true;
  w.views = [{ state: "frozen", xSplit: 4, ySplit: HDR, showGridLines: false, zoomScale: 90 }];
  w.autoFilter = `A${HDR}:BD${N}`;

  // ===== Contabilização =====
  const wc = ABAS["Contabilização"];
  banner(wc, "Contabilização dos impostos", "Lançamentos do mês por empresa — filtre Valor > 0 e exporte para o sistema contábil", 10);
  const ccols = [["Código", 8], ["Empresa", 34], ["Data", 11], ["Descrição", 16], ["Lanç. aut.", 8], ["Débito", 9], ["Crédito", 9], ["Valor", 12], ["Centro de custo", 10], ["Histórico", 38]];
  ccols.forEach(([h, wd], i) => { wc.getColumn(i + 1).width = wd; wc.getCell(5, i + 1).value = h; }); cabTabela(wc, 5);
  const LANC = [["Desp. PIS", "PIS", "desp", "pas", "Z", "VR REF. PIS D/MÊS."], ["Desp. COFINS", "COFINS", "desp", "pas", "AB", "VR REF. COFINS D/MÊS."], ["PIS retido", "PIS", "pas", "ret", "N", "VR REF. COMPENSAÇÃO DE PIS RETIDO."], ["COFINS retida", "COFINS", "pas", "ret", "O", "VR REF. COMPENSAÇÃO DE COFINS RETIDA."], ["Desp. IRPJ", "IRPJ", "desp", "pas", "U", "VR REF. IRPJ D/MÊS."], ["Desp. CSLL", "CSLL", "desp", "pas", "X", "VR REF. CSLL D/MÊS."], ["IRRF", "IRPJ", "pas", "ret", "L", "VR REF. COMPENSAÇÃO DE IRRF."], ["CSLL retida", "CSLL", "pas", "ret", "M", "VR REF. COMPENSAÇÃO DE CSLL RETIDA."], ["Desp. ISS", "ISS", "desp", "pas", "AE", "VR REF. ISS D/MÊS."]];
  let cr = 6;
  fech.forEach((r, i) => {
    const n = R0 + i;
    for (const [desc, trib, deb, cred, col, hist] of LANC) {
      wc.getRow(cr).values = [r.cod, { formula: `Fechamento!$C$${n}` }, { formula: `EOMONTH(Fechamento!$D$${n},0)` }, desc, null, { formula: CT[trib][deb] }, { formula: CT[trib][cred] }, { formula: `ROUND(N(Fechamento!$${col}$${n}),2)` }, null, hist];
      wc.getCell(`C${cr}`).numFmt = "dd/mm/yyyy"; wc.getCell(`H${cr}`).numFmt = moeda;
      for (let c = 1; c <= 10; c++) { const cell = wc.getCell(cr, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin("FFEEF0F3") }; }
      cr++;
    }
  });
  wc.views = [{ state: "frozen", ySplit: 5, showGridLines: false }]; wc.autoFilter = `A5:J${cr - 1}`;

  // ===== Painel =====
  const wp = ABAS["Painel"];
  for (let c = 1; c <= 18; c++) wp.getColumn(c).width = c === 1 ? 2 : 11.5;
  banner(wp, `Painel do Fechamento — Lucro Presumido ${ANO}`, `SOMA Contabilidade Integrada · ${empresas.length} empresas do Lucro Presumido · dados de ${DATA_GERACAO}`, 18);
  wp.addImage(logoId, { tl: { col: 15.6, row: 0.15 }, ext: { width: 92, height: 72 } });
  wp.getCell("B5").value = "Competência"; wp.getCell("B5").font = { name: FONT, bold: true, size: 10, color: { argb: C.navy } }; wp.getCell("B5").alignment = { vertical: "middle" };
  const mesAtual = new Date().getUTCMonth(); // mês anterior ao atual
  const sel = wp.getCell("C5"); sel.value = dt(ANO, Math.max(1, Math.min(12, ANO === new Date().getFullYear() ? mesAtual : 12))); sel.numFmt = mesLongo; sel.fill = fill(C.navy); sel.font = { name: FONT, bold: true, size: 12, color: { argb: C.white } }; sel.alignment = { horizontal: "center", vertical: "middle" };
  wp.mergeCells("C5:D5");
  wp.getCell("E5").value = "◀ escolha o mês na lista — o painel inteiro recalcula"; wp.getCell("E5").font = { name: FONT, italic: true, size: 9, color: { argb: C.gray } }; wp.getCell("E5").alignment = { vertical: "middle" };
  wp.getRow(5).height = 26;
  const AUXC = 21, aux = (r, c) => wp.getCell(r, AUXC + c);
  const FD = `Fechamento!$D$${R0}:$D$${N}`, FC = (c) => `Fechamento!$${c}$${R0}:$${c}$${N}`;
  const sm = (c) => `SUMIFS(${FC(c)},${FD},$C$5)`;
  aux(4, 0).value = "Dados dos gráficos (calculados)";
  ["Mês", "Receita", "Impostos da competência", "Guias a emitir"].forEach((h, i) => (aux(5, i).value = h));
  for (let m = 1; m <= 12; m++) { const r = 5 + m; aux(r, 0).value = dt(ANO, m); aux(r, 0).numFmt = mesFmt; aux(r, 1).value = { formula: `SUMIFS(${FC("J")},${FD},$U${r})+SUMIFS(${FC("I")},${FD},$U${r})` }; aux(r, 2).value = { formula: `SUMIFS(${FC("BA")},${FD},$U${r})` }; aux(r, 3).value = { formula: `SUMIFS(${FC("AK")},${FD},$U${r})` }; for (let k = 1; k <= 3; k++) aux(r, k).numFmt = moeda0; }
  sel.dataValidation = { type: "list", allowBlank: false, formulae: ["$U$6:$U$17"] };
  aux(19, 0).value = "Tributo"; aux(19, 1).value = "Valor";
  [["IRPJ", "U"], ["CSLL", "X"], ["PIS", "Z"], ["COFINS", "AB"], ["ISS", "AE"]].forEach(([t, c], i) => { aux(20 + i, 0).value = t; aux(20 + i, 1).value = { formula: sm(c) }; aux(20 + i, 1).numFmt = moeda0; });
  aux(26, 0).value = "Situação"; aux(26, 1).value = "Empresas";
  ["Quitado", "A pagar", "Sem guia no mês", "Sem movimento"].forEach((s, i) => { aux(27 + i, 0).value = s; aux(27 + i, 1).value = { formula: `COUNTIFS(${FD},$C$5,${FC("AZ")},U${27 + i})` }; });
  aux(32, 0).value = "Retenção"; aux(32, 1).value = "Valor";
  [["IRRF", "L"], ["CSLL", "M"], ["PIS", "N"], ["COFINS", "O"], ["ISS", "P"]].forEach(([t, c], i) => { aux(33 + i, 0).value = t; aux(33 + i, 1).value = { formula: sm(c) }; aux(33 + i, 1).numFmt = moeda0; });
  for (let r = 4; r <= 38; r++) for (let c = 0; c <= 3; c++) aux(r, c).font = { name: FONT, size: 9, color: { argb: C.gray } };
  for (let c = AUXC; c <= AUXC + 3; c++) wp.getColumn(c).width = 14;
  const card = (r, c, titulo, formula, numFmt, nota, destaque = C.navy) => {
    const col = (k) => String.fromCharCode(64 + c + k);
    for (let k = 0; k < 3; k++) wp.mergeCells(`${col(0)}${r + k}:${col(2)}${r + k}`);
    const t = wp.getCell(`${col(0)}${r}`); t.value = titulo.toUpperCase(); t.font = { name: FONT, size: 8, bold: true, color: { argb: C.gray } }; t.alignment = { vertical: "bottom", indent: 1 };
    const v = wp.getCell(`${col(0)}${r + 1}`); v.value = { formula }; v.numFmt = numFmt; v.font = { name: FONT, size: 20, bold: true, color: { argb: destaque } }; v.alignment = { vertical: "middle", indent: 1 };
    const s = wp.getCell(`${col(0)}${r + 2}`); s.value = typeof nota === "string" && nota.startsWith("=") ? { formula: nota.slice(1) } : nota; s.font = { name: FONT, size: 8, color: { argb: C.gray } }; s.alignment = { vertical: "top", indent: 1 };
    for (let k = 0; k <= 2; k++) for (let rr = r; rr <= r + 2; rr++) wp.getCell(`${col(k)}${rr}`).fill = fill(C.bg);
    for (let rr = r; rr <= r + 2; rr++) wp.getCell(`${col(0)}${rr}`).border = { left: { style: "thick", color: { argb: destaque === C.navy ? C.gold : destaque } } };
  };
  const cnt = (s) => `COUNTIFS(${FD},$C$5,${FC("AZ")},"${s}")`;
  for (const r of [7, 8, 9, 11, 12, 13]) wp.getRow(r).height = r === 8 || r === 12 ? 34 : 16;
  card(7, 2, "Empresas com movimento", `COUNTIFS(${FD},$C$5)-${cnt("Sem movimento")}`, "0", `="de "&COUNTIFS(${FD},$C$5)&" no Lucro Presumido"`);
  card(7, 5, "Receita do mês", `${sm("J")}+${sm("I")}`, moeda0, `="hospitalar: R$ "&FIXED(${sm("G")},0)`);
  card(7, 8, "Impostos da competência", sm("BA"), moeda0, "IRPJ + CSLL + PIS + COFINS + ISS");
  card(7, 11, "Carga tributária média", `IFERROR(${sm("BA")}/(${sm("J")}+${sm("I")}),0)`, pct1, "impostos ÷ receita");
  card(7, 14, "Retenções nas notas", `${sm("L")}+${sm("M")}+${sm("N")}+${sm("O")}`, moeda0, "IRRF + CSLL + PIS + COFINS");
  card(11, 2, "Guias a emitir", sm("AK"), moeda0, `="IRPJ/CSLL: R$ "&FIXED(${sm("AF")}+${sm("AG")},0)`);
  card(11, 5, "Pago / compensado", `SUMIFS(${FC("AQ")},${FD},$C$5)+${["AP", "AR", "AS", "AT", "AU", "AV", "AW", "AX"].map(sm).join("+")}`, moeda0, "DARFs e compensações lançados", C.green);
  card(11, 8, "Saldo a pagar", `SUMIFS(${FC("AY")},${FD},$C$5,${FC("AY")},">0")`, moeda0, `=${cnt("A pagar")}&" empresas com guia em aberto"`, C.red);
  card(11, 11, "Empresas quitadas", `IFERROR(${cnt("Quitado")}/(${cnt("Quitado")}+${cnt("A pagar")}),0)`, "0%", `=${cnt("Quitado")}&" de "&(${cnt("Quitado")}+${cnt("A pagar")})&" com guia"`, C.green);
  card(11, 14, "Fechamento do trimestre?", `IF(MOD(MONTH($C$5),3)=0,"Sim","Não")`, "@", "IRPJ/CSLL trimestrais saem nos meses 3, 6, 9 e 12", C.slate);
  const secao = (r, c1, c2, txt) => { wp.mergeCells(`${c1}${r}:${c2}${r}`); const cell = wp.getCell(`${c1}${r}`); cell.value = txt; cell.font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } }; for (let c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++) wp.getCell(`${String.fromCharCode(c)}${r}`).border = { bottom: thin(C.gold) }; };
  secao(15, "B", "J", `Receita × impostos — ${ANO}`); secao(15, "L", "R", "Composição dos impostos do mês");
  secao(34, "B", "J", "Situação das guias no mês"); secao(34, "L", "R", "Retenções nas notas do mês");
  wp.getRow(15).height = 24; wp.getRow(34).height = 24;
  const PR = 53;
  secao(PR, "B", "R", "Guias em aberto no mês — maiores saldos primeiro");
  const pcols = [["B", "Código"], ["C", "Empresa"], ["G", "IRPJ"], ["H", "CSLL"], ["I", "PIS"], ["J", "COFINS"], ["K", "ISS"], ["L", "Total guias"], ["M", "Pago/comp."], ["N", "Saldo"], ["O", "Situação"], ["Q", "Carga"], ["R", "Mensal?"]];
  wp.mergeCells(`C${PR + 1}:F${PR + 1}`); wp.mergeCells(`O${PR + 1}:P${PR + 1}`);
  pcols.forEach(([c, h]) => (wp.getCell(`${c}${PR + 1}`).value = h));
  for (let c = 2; c <= 18; c++) { const cell = wp.getCell(PR + 1, c); cell.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } }; cell.fill = fill(C.navy); cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; }
  wp.getRow(PR + 1).height = 28;
  const BE = FC("BE");
  for (let k = 1; k <= 25; k++) {
    const r = PR + 1 + k, pos = `MATCH(LARGE(${BE},${k}),${BE},0)`, pega = (c) => `IFERROR(INDEX(${FC(c)},${pos}),"")`;
    wp.mergeCells(`C${r}:F${r}`); wp.mergeCells(`O${r}:P${r}`);
    const put = (c, f, nf) => { const cell = wp.getCell(`${c}${r}`); cell.value = { formula: f }; if (nf) cell.numFmt = nf; };
    put("B", pega("B")); put("C", pega("C")); put("G", pega("AF"), moeda); put("H", pega("AG"), moeda); put("I", pega("AH"), moeda); put("J", pega("AI"), moeda); put("K", pega("AJ"), moeda); put("L", pega("AK"), moeda);
    put("M", `IFERROR(${pega("AK")}-${pega("AY")},"")`, moeda); put("N", pega("AY"), moeda); put("O", pega("AZ")); put("Q", pega("BB"), pct1); put("R", pega("E"));
    for (let c = 2; c <= 18; c++) { const cell = wp.getCell(r, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; if (k % 2 === 0) cell.fill = fill(C.bg); }
    for (const c of ["B", "O", "Q", "R"]) wp.getCell(`${c}${r}`).alignment = { horizontal: "center" };
    wp.getCell(`N${r}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.red } };
  }
  wp.addConditionalFormatting({ ref: `O${PR + 2}:O${PR + 26}`, rules: [sitStyle("A pagar", C.amberSoft, C.amber)] });
  wp.getCell(`B${PR + 28}`).value = { formula: `IF(COUNT(${BE})>25,"+ "&(COUNT(${BE})-25)&" guias em aberto — filtre a coluna Situação no Fechamento","")` };
  wp.getCell(`B${PR + 28}`).font = { name: FONT, italic: true, size: 9, color: { argb: C.gray } };
  wp.views = [{ showGridLines: false, zoomScale: 90 }];

  // ===== Empresa (ficha anual no formato da planilha 122-LP) =====
  const wv = ABAS["Empresa"];
  banner(wv, "Ficha anual da empresa — Lucro Presumido", "Escolha o código — receita, IRPJ, CSLL, PIS, COFINS, ISS e guias mês a mês", 24);
  wv.addImage(logoId, { tl: { col: 22.6, row: 0.15 }, ext: { width: 92, height: 72 } });
  wv.getCell("B5").value = "Código"; wv.getCell("B5").font = { name: FONT, bold: true, color: { argb: C.navy } };
  const cs = wv.getCell("C5"); cs.value = par.find((x) => x.e.codigo_cliente === "122") ? "122" : par[0].e.codigo_cliente;
  cs.fill = fill(C.navy); cs.font = { name: FONT, bold: true, size: 13, color: { argb: C.white } }; cs.alignment = { horizontal: "center", vertical: "middle" };
  cs.dataValidation = { type: "list", allowBlank: false, formulae: [`Empresas!$A$2:$A$${NE}`] };
  const look = (c) => `IFERROR(INDEX(Empresas!$${c}$2:$${c}$${NE},MATCH($C$5,Empresas!$A$2:$A$${NE},0)),"")`;
  wv.mergeCells("D5:J5"); const nm = wv.getCell("D5"); nm.value = { formula: look("B") }; nm.font = { name: FONT, bold: true, size: 13, color: { argb: C.navy } }; nm.alignment = { vertical: "middle", indent: 1 };
  [["K5", "CNPJ", "L5", look("C")], ["N5", "Município", "O5", look("D")], ["Q5", "IRPJ/CSLL mensal?", "S5", look("E")], ["T5", "ISS", "U5", `${look("L")}&" "&IF(${look("L")}="Fixo","R$ "&FIXED(${look("N")},2),FIXED(${look("M")}*100,2)&"%")`]].forEach(([lc, l, vc, f]) => { wv.getCell(lc).value = l; wv.getCell(lc).font = { name: FONT, size: 8, bold: true, color: { argb: C.gray } }; wv.getCell(lc).alignment = { horizontal: "right", vertical: "middle" }; wv.getCell(vc).value = { formula: f }; wv.getCell(vc).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } }; wv.getCell(vc).alignment = { vertical: "middle" }; });
  wv.mergeCells("L5:M5"); wv.mergeCells("O5:P5"); wv.mergeCells("Q5:R5"); wv.mergeCells("U5:W5");
  wv.getRow(5).height = 28;
  const VH = 8;
  const vcols = [["B", "Mês", null], ["C", "Serviços", "F"], ["D", "Hospitalar", "G"], ["E", "Vendas", "H"], ["F", "Outras", "I"], ["G", "Receita total", "J"], ["H", "Base IRPJ", "Q"], ["I", "IRPJ do mês", "U"], ["J", "IRRF", "L"], ["K", "IRPJ devido", "V"], ["L", "Base CSLL", "W"], ["M", "CSLL do mês", "X"], ["N", "CSLL retida", "M"], ["O", "CSLL devida", "Y"], ["P", "PIS", "Z"], ["Q", "PIS retido", "N"], ["R", "COFINS", "AB"], ["S", "COFINS retida", "O"], ["T", "ISS", "AE"], ["U", "Guias a emitir", "AK"], ["V", "Pago/comp.", "*pago"], ["W", "Saldo", "AY"], ["X", "Situação", "AZ"]];
  [["C", "G", "Receita", C.gold], ["H", "K", "IRPJ", C.navy2], ["L", "O", "CSLL", C.navy2], ["P", "T", "PIS · COFINS · ISS", C.slate], ["U", "X", "Guias", C.navy]].forEach(([a, b, t, cor]) => { wv.mergeCells(`${a}${VH - 1}:${b}${VH - 1}`); const c = wv.getCell(`${a}${VH - 1}`); c.value = t; c.fill = fill(cor); c.font = { name: FONT, bold: true, size: 9, color: { argb: cor === C.gold ? C.navyDeep : C.white } }; c.alignment = { horizontal: "center" }; });
  vcols.forEach(([c, h]) => (wv.getCell(`${c}${VH}`).value = h)); cabTabela(wv, VH);
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const FA = FC("A");
  let rv = VH + 1; const linhasTri = [], linhasMes = [];
  for (let q = 1; q <= 4; q++) {
    const ini = rv;
    for (let k = 1; k <= 3; k++) {
      const m = (q - 1) * 3 + k, key = `$C$5&"|"&${ANO * 100 + m}`;
      wv.getCell(`B${rv}`).value = MESES[m - 1];
      for (const [c, , src] of vcols.slice(1)) {
        const f = src === "*pago" ? ["AP", "AQ", "AR", "AS", "AT", "AU", "AV", "AW", "AX"].map((x) => `SUMIFS(${FC(x)},${FA},${key})`).join("+") : `IFERROR(INDEX(${FC(src)},MATCH(${key},${FA},0)),"")`;
        wv.getCell(`${c}${rv}`).value = { formula: f }; if (src !== "AZ") wv.getCell(`${c}${rv}`).numFmt = moeda;
      }
      for (let c = 2; c <= 24; c++) { const cell = wv.getCell(rv, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; }
      for (const c of ["G", "U"]) wv.getCell(`${c}${rv}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.navy } };
      wv.getCell(`X${rv}`).alignment = { horizontal: "center" };
      linhasMes.push(rv); rv++;
    }
    wv.getCell(`B${rv}`).value = `${q}º trimestre`;
    for (const [c, , src] of vcols.slice(1)) { if (src === "AZ") continue; wv.getCell(`${c}${rv}`).value = { formula: `SUM(${c}${ini}:${c}${rv - 1})` }; wv.getCell(`${c}${rv}`).numFmt = moeda; }
    for (let c = 2; c <= 24; c++) { const cell = wv.getCell(rv, c); cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.navy } }; cell.fill = fill(C.goldPale); cell.border = { bottom: thin(C.gold) }; }
    linhasTri.push(rv); rv++;
  }
  wv.getCell(`B${rv}`).value = "Total do ano";
  for (const [c, , src] of vcols.slice(1)) { if (src === "AZ") continue; wv.getCell(`${c}${rv}`).value = { formula: linhasTri.map((x) => `${c}${x}`).join("+") }; wv.getCell(`${c}${rv}`).numFmt = moeda; }
  for (let c = 2; c <= 24; c++) { const cell = wv.getCell(rv, c); cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } }; cell.fill = fill(C.navy); }
  wv.addConditionalFormatting({ ref: `X${VH + 1}:X${rv}`, rules: [sitStyle("Quitado", C.greenSoft, C.green), sitStyle("A pagar", C.amberSoft, C.amber), sitStyle("Sem guia", "FFEAF0F7", C.slate), sitStyle("Sem movimento", "FFF1F2F4", C.gray)] });
  wv.getColumn("A").width = 2; wv.getColumn("B").width = 13; for (let c = 3; c <= 24; c++) wv.getColumn(c).width = 11.5; wv.getColumn("X").width = 15;
  wv.views = [{ showGridLines: false, zoomScale: 90, state: "frozen", ySplit: VH, xSplit: 2 }];
  // dados contíguos do gráfico da empresa (o Excel não monta série de faixas separadas)
  wv.getCell("Z27").value = "Dados do gráfico"; wv.getCell("Z27").font = { name: FONT, size: 8, color: { argb: C.gray } };
  ["Mês", "Receita", "Guias a emitir"].forEach((h, i) => { const c = wv.getCell(28, 26 + i); c.value = h; c.font = { name: FONT, size: 8, color: { argb: C.gray } }; });
  linhasMes.forEach((lr, i) => { const r = 29 + i; wv.getCell(r, 26).value = MESES[i].slice(0, 3); wv.getCell(r, 27).value = { formula: `N(G${lr})` }; wv.getCell(r, 28).value = { formula: `N(U${lr})` }; for (let c = 26; c <= 28; c++) wv.getCell(r, c).font = { name: FONT, size: 8, color: { argb: C.gray } }; });
  const graficoEmpresa = { meses: linhasMes };

  // ===== Como usar =====
  const wl = ABAS["Como usar"];
  banner(wl, "Como usar esta planilha", "SOMA Contabilidade Integrada", 3);
  wl.getColumn(1).width = 2; wl.getColumn(2).width = 4; wl.getColumn(3).width = 140;
  [["Painel", "Escolha a competência em C5. Indicadores, gráficos e a lista de guias em aberto mudam para o mês escolhido."],
   ["Fechamento", "Uma linha por empresa e mês. Células douradas são de digitação (vendas, outras receitas, compensação e DARF pago por tributo, observação); o resto é fórmula. O '+' acima das colunas abre o cálculo intermediário."],
   ["Receita", "Serviços e serviços hospitalares vêm das notas (a equiparação hospitalar é marcada nota a nota no sistema). Vendas e outras receitas (ex.: rendimentos de aplicação) são digitadas; outras receitas entram direto na base do IRPJ/CSLL e não no PIS/COFINS."],
   ["IRPJ/CSLL", "Base = serviços × 32% + hospitalar × 8% (CSLL 12%) + vendas × 8% (CSLL 12%) + outras receitas — presunções editáveis por empresa na aba Empresas. IRPJ 15% + adicional de 10% sobre a base que passar de R$ 60 mil no trimestre (R$ 20 mil no mês, se a apuração for mensal); CSLL 9%. Trimestral: a guia sai no 3º mês do trimestre, abatendo as retenções do trimestre."],
   ["PIS/COFINS", "Cumulativos: 0,65% e 3% sobre a receita (serviços + vendas), menos o retido nas notas."],
   ["ISS", "Percentual: (serviços − receita com ISS retido pelo tomador) × alíquota. Fixo (uniprofissional): valor mensal da aba Empresas."],
   ["DARF mínimo", "Valor abaixo de R$ 10 não gera guia: acumula para o próximo período (colunas 'Saldo abaixo do mínimo')."],
   ["Pagamento", "Lance a compensação e o DARF pago na linha do mês da guia (trimestral: no 3º mês). Situação: Quitado, A pagar, Sem guia no mês, Sem movimento."],
   ["Contabilização", "Lançamentos de despesa e de compensação das retenções de cada empresa/mês, com as contas da aba Tabelas. Filtre Valor > 0 para exportar."],
   ["Atualizar", `Atualizada em ${DATA_GERACAO}. Rode o atalho "Atualizar Fechamento LP" (ou npm run fechamento:lp) depois de buscar as notas — o que foi digitado aqui é mantido.`]].forEach(([k, t], i) => { const r = 5 + i * 2; const a = wl.getCell(`C${r}`); a.value = k; a.font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } }; const b = wl.getCell(`C${r + 1}`); b.value = t; b.font = { name: FONT, size: 10, color: { argb: C.ink } }; b.alignment = { wrapText: true, vertical: "top" }; wl.getRow(r + 1).height = 30; wl.getCell(`B${r}`).value = "■"; wl.getCell(`B${r}`).font = { color: { argb: C.gold } }; });

  // ---------- grava, guarda a anterior e insere os gráficos ----------
  const base = path.join(os.tmpdir(), `fechamento-lp-base-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(base);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT)) { const bk = path.join(path.dirname(OUT), "versoes-anteriores"); fs.mkdirSync(bk, { recursive: true }); fs.copyFileSync(OUT, path.join(bk, `${path.basename(OUT, ".xlsx")} - ${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}.xlsx`)); }
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(DIR, "graficos.ps1"), "-Entrada", base, "-Saida", OUT, "-LinhaIni", String(graficoEmpresa.meses[0])], { encoding: "utf8" });
  fs.rmSync(base, { force: true });
  if (ps.status !== 0 || !/ok/.test(ps.stdout)) throw new Error(`Falha ao montar os gráficos no Excel (a planilha está aberta?):\n${ps.stdout}\n${ps.stderr}`);
  console.log(`\nPlanilha atualizada: ${OUT}`);
  console.log(`  ${empresas.length} empresas, ${fech.length} linhas, ${cr - 6} lançamentos contábeis.`);
}

main().catch((e) => { console.error("\nErro:", e.message); process.exit(1); });
