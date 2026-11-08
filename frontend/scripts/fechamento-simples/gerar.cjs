#!/usr/bin/env node
// Fechamento do Simples Nacional — gera/atualiza a planilha única de todas as empresas do Simples.
//
// Uso (na pasta frontend):
//   npm run fechamento:simples                       -> ano corrente, atualiza a planilha padrão
//   npm run fechamento:simples -- --ano 2026
//   npm run fechamento:simples -- --saida "C:\caminho\Fechamento Simples 2026.xlsx"
//   npm run fechamento:simples -- --buscar-extratos 2026-10            (mostra quantas consultas faria)
//   npm run fechamento:simples -- --buscar-extratos 2026-10 --confirmar  (consulta o Integra Contador — tem custo)
//
// Fontes: notas (dps + notas_distribuidas), receita manual, folha_mensal (importação do Resumo da folha),
// cadastro das empresas e os extratos do PGDAS-D já consultados no Integra Contador (cache).
// O que foi digitado na planilha (receita sem nota no sistema, compensação, pago, observação,
// receita/DAS declarados à mão) é preservado ao atualizar. Precisa do Excel instalado para os gráficos.
/* eslint-disable @typescript-eslint/no-require-imports -- script Node avulso (CommonJS), fora do bundle do Next */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const ExcelJS = require("exceljs");
const sharp = require("sharp");
const { createClient } = require("@supabase/supabase-js");
const { PDFParse } = require("pdf-parse");

const DIR = __dirname;
const FRONT = path.resolve(DIR, "..", "..");
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const tem = (k) => args.includes(k);
const ANO = Number(arg("--ano") || new Date().getFullYear());
const OUT = path.resolve(arg("--saida") || path.join(os.homedir(), "Documents", "ClaudeCode", "fechamento-simples", `Fechamento Simples ${ANO}.xlsx`));
const DATA_GERACAO = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

const env = Object.fromEntries(fs.readFileSync(path.join(FRONT, ".env.local"), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.trim().startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^"|"$/g, "")]));
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tab = JSON.parse(fs.readFileSync(path.join(DIR, "tabelas-sn.json"), "utf8"));

async function todos(q) { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break; } return out; }
const lotes = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const numBr = (t) => Number(String(t).replace(/\./g, "").replace(",", "."));

async function carregarSistema() {
  const empresas = await todos(() => sb.from("companies").select("id, codigo_cliente, legal_name, trade_name, cnpj, data_abertura, sujeito_fator_r, municipality_name").eq("ativa", true).eq("tax_regime", "SIMPLES_NACIONAL").not("codigo_cliente", "is", null).order("id"));
  const ids = empresas.map((c) => c.id);
  const ini = `${ANO - 1}-01-01`, fim = `${ANO + 1}-01-01`;
  let dps = [], nd = [], folha = [], man = [];
  for (const ch of lotes(ids, 40)) {
    dps.push(...await todos(() => sb.from("dps").select("id, company_id, valor, status, data_competencia, nfse(status, access_key), services(tipo_retencao_issqn)").in("company_id", ch).gte("data_competencia", ini).lt("data_competencia", fim).order("id")));
    nd.push(...await todos(() => sb.from("notas_distribuidas").select("id, company_id, chave_acesso, valor_servico, competencia, cancelada, tipo_retencao_issqn").in("company_id", ch).eq("direcao", "saida").gte("competencia", ini).lt("competencia", fim).order("id")));
    folha.push(...await todos(() => sb.from("folha_mensal").select("company_id, competencia, valor, pro_labore, fgts").in("company_id", ch).gte("competencia", `${ANO - 1}-01`).lte("competencia", `${ANO}-12`).order("competencia")));
    man.push(...await todos(() => sb.from("receita_mensal_manual").select("company_id, competencia, valor").in("company_id", ch).order("competencia")));
  }
  // mesma regra do sistema (lib/faturamento.ts): dedup por chave, sem canceladas, retido = tpRetISSQN 2/3
  const rec = {}; const add = (cid, comp, v, ret) => { rec[cid] ??= {}; rec[cid][comp] ??= { normal: 0, retido: 0 }; rec[cid][comp][ret ? "retido" : "normal"] += v; };
  const vistos = new Set();
  const retPorChave = new Map(nd.filter((n) => n.chave_acesso).map((n) => [n.chave_acesso, n.tipo_retencao_issqn]));
  const cancPorChave = new Map(nd.filter((n) => n.chave_acesso).map((n) => [n.chave_acesso, n.cancelada]));
  for (const d of dps) {
    if (d.status !== "ACCEPTED") continue;
    const n = Array.isArray(d.nfse) ? d.nfse[0] : d.nfse; const ch = n?.access_key; if (ch) vistos.add(ch);
    if (n?.status === "CANCELADA" || (ch && cancPorChave.get(ch))) continue;
    const sv = Array.isArray(d.services) ? d.services[0] : d.services; const tr = (ch ? retPorChave.get(ch) : null) ?? sv?.tipo_retencao_issqn;
    add(d.company_id, d.data_competencia.slice(0, 7), Number(d.valor), tr === 2 || tr === 3);
  }
  for (const n of nd) { if (n.chave_acesso && vistos.has(n.chave_acesso)) continue; if (n.chave_acesso) vistos.add(n.chave_acesso); if (n.cancelada) continue; add(n.company_id, String(n.competencia).slice(0, 7), Number(n.valor_servico || 0), n.tipo_retencao_issqn === 2 || n.tipo_retencao_issqn === 3); }
  const manual = {}; for (const m of man) (manual[m.company_id] ??= {})[m.competencia] = Number(m.valor);
  const fol = {}; for (const f of folha) (fol[f.company_id] ??= {})[f.competencia] = { valor: Number(f.valor), proLabore: f.pro_labore == null ? null : Number(f.pro_labore), fgts: f.fgts == null ? null : Number(f.fgts) };
  console.log(`Sistema: ${empresas.length} empresas do Simples, ${nd.length + dps.length} notas de ${ANO - 1}-${ANO}, ${folha.length} meses de folha.`);
  return { empresas, receitas: rec, manual, folha: fol };
}

// Extratos do PGDAS-D (CONSEXTRATO16) já consultados — lidos do cache do Integra Contador, sem custo.
async function carregarExtratos(empresas) {
  const porCnpj = new Map(empresas.filter((e) => e.cnpj).map((e) => [e.cnpj, e.codigo_cliente]));
  const linhas = await todos(() => sb.from("integra_contador_cache").select("contribuinte_cnpj, resposta, fetched_at").eq("id_servico", "CONSEXTRATO16").eq("status", 200).order("fetched_at"));
  const ext = {}; let lidos = 0;
  for (const l of linhas) {
    const cod = porCnpj.get(l.contribuinte_cnpj); if (!cod) continue;
    let pdf; try { const d = JSON.parse(l.resposta?.dados || "{}"); pdf = d.pdf ?? d.extrato?.pdf ?? d.docArrecadacaoPdfB64; } catch { continue; }
    if (!pdf) continue;
    const t = (await new PDFParse({ data: Buffer.from(pdf, "base64") }).getText()).text;
    const pa = t.match(/Per[íi]odo de Apura[çc][ãa]o \(PA\):\s*(\d{2})\/(\d{4})/); if (!pa) continue;
    const k = `${pa[2]}-${pa[1]}`;
    const e = (ext[cod] ??= { receitas: {}, rpaPorPA: {}, dasPorPA: {}, fatorR: {} });
    const sec = t.match(/2\.2\.1\)\s*Mercado Interno([\s\S]*?)2\.2\.2\)\s*Mercado Externo([\s\S]*?)2\.3\)/);
    if (sec) { const acc = {}; for (const part of [sec[1], sec[2]]) { const re = /(\d{2})\/(\d{4})\s+([\d.]+,\d{2})/g; let m; while ((m = re.exec(part))) { const kk = `${m[2]}-${m[1]}`; acc[kk] = (acc[kk] || 0) + numBr(m[3]); } } Object.assign(e.receitas, acc); }
    const rpa = t.match(/Receita Bruta do PA \(RPA\) - Compet[êe]ncia\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/); if (rpa) e.rpaPorPA[k] = numBr(rpa[3]);
    const tot = t.match(/4\) Total Geral da Empresa[\s\S]*?Total do D[ée]bito Declarado[\s\S]*?ICMS IPI ISS Total\s*\n?\s*(?:[\d.,]+\s+){8}([\d.,]+)/); if (tot) e.dasPorPA[k] = numBr(tot[1]);
    e.fatorR[k] = t.match(/Fator r\s*=\s*([^\n]+)/)?.[1].trim();
    lidos++;
  }
  console.log(`Extratos do PGDAS-D no cache: ${lidos} lidos (${Object.keys(ext).length} empresas).`);
  return ext;
}

// --buscar-extratos AAAA-MM: consulta o Integra Contador (CONSDECLARACAO13 + CONSEXTRATO16) — tem custo.
async function buscarExtratos(empresas, comp) {
  const URL_IC = env.INTEGRA_CONTADOR_URL, TOKEN = env.INTEGRA_CONTADOR_INTERNAL_TOKEN;
  if (!URL_IC || !TOKEN) throw new Error("Para buscar extratos, coloque INTEGRA_CONTADOR_URL e INTEGRA_CONTADOR_INTERNAL_TOKEN no frontend/.env.local.");
  const pa = comp.replace("-", "");
  const alvo = empresas.filter((e) => e.cnpj);
  if (!tem("--confirmar")) {
    console.log(`\n--buscar-extratos ${comp}: ${alvo.length} empresas -> até ${alvo.length * 2} consultas cobradas pelo Serpro (1 declaração + 1 extrato por empresa com DAS).`);
    console.log("Nada foi consultado. Para rodar de verdade, repita com --confirmar.\n");
    return;
  }
  const get = async (p) => { const r = await fetch(URL_IC + p, { headers: { "X-Internal-Token": TOKEN }, signal: AbortSignal.timeout(90000) }); return { ok: r.ok, b: await r.json().catch(() => null) }; };
  let ok = 0, semDas = 0, erro = 0;
  for (const [i, e] of alvo.entries()) {
    try {
      const d = await get(`/contribuintes/${e.cnpj}/simples/declaracoes/${pa}`);
      if (!d.ok) { erro++; continue; }
      const dados = JSON.parse(d.b.resposta.dados || "{}");
      const ops = (dados.periodos ?? []).find((p) => String(p.periodoApuracao) === pa)?.operacoes ?? [];
      const das = ops.filter((o) => o.indiceDas?.numeroDas).map((o) => o.indiceDas);
      if (!das.length) { semDas++; continue; }
      const x = await get(`/contribuintes/${e.cnpj}/simples/extrato-das/${das[das.length - 1].numeroDas}`);
      if (x.ok) ok++; else erro++;
    } catch { erro++; }
    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${alvo.length}…`);
  }
  console.log(`Integra Contador ${comp}: ${ok} extratos, ${semDas} sem DAS no período, ${erro} erros (ex.: sem procuração).`);
}

// O que já está na planilha (para não perder o que foi digitado à mão).
async function lerPlanilhaAnterior() {
  const prev = { linhas: new Map(), hist: new Map() };
  if (!fs.existsSync(OUT)) return prev;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(OUT);
  const val = (c) => { const v = c.value; if (v == null || v === "") return null; if (typeof v === "object" && !(v instanceof Date)) return v.result ?? null; return v; };
  const ws = wb.getWorksheet("Fechamento");
  if (ws) {
    for (let r = 6; r <= ws.rowCount; r++) {
      const cod = val(ws.getCell(`B${r}`)), d = val(ws.getCell(`D${r}`)); if (!cod || !(d instanceof Date)) continue;
      const k = `${cod}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const o = {}; for (const c of ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "Q", "AP", "AR", "AS", "BD", "BE"]) o[c] = val(ws.getCell(`${c}${r}`));
      prev.linhas.set(k, o);
    }
  }
  const wh = wb.getWorksheet("Histórico");
  if (wh) for (let r = 2; r <= wh.rowCount; r++) { const cod = val(wh.getCell(`A${r}`)), d = val(wh.getCell(`B${r}`)), v = val(wh.getCell(`C${r}`)); if (cod && d instanceof Date && typeof v === "number") prev.hist.set(`${cod}|${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, { v, fonte: val(wh.getCell(`D${r}`)) }); }
  console.log(`Planilha anterior: ${prev.linhas.size} linhas lidas (o que foi digitado será mantido).`);
  return prev;
}

async function main() {
  const sis = await carregarSistema();
  const comp = arg("--buscar-extratos");
  if (comp) { await buscarExtratos(sis.empresas, comp); if (!tem("--confirmar")) return; }
  const ext = await carregarExtratos(sis.empresas);
  const prev = await lerPlanilhaAnterior();
  const logoBuf = await sharp(path.join(FRONT, "public", "soma-logo.png")).trim().png().toBuffer();
  const iconBuf = await sharp(path.join(FRONT, "public", "soma-icon.png")).trim().png().toBuffer();
const LIMIAR_FR = 0.28, ISS_MAX = 0.05, ISS_MIN = 0.02;
const TRIB = ["IRPJ", "CSLL", "COFINS", "PIS", "CPP", "IPI", "ISS", "ICMS"];
const ANEXOS = ["I", "II", "III", "IV", "V"];

const empresas = sis.empresas.slice().sort((a, b) => a.codigo_cliente.localeCompare(b.codigo_cliente));
const ym = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const dt = (y, m) => new Date(Date.UTC(y, m - 1, 1));
const r2 = (x) => Math.round(x * 100) / 100;

// ---------- motor (espelho das fórmulas, para gravar o resultado já calculado e validar) ----------
const faixaDe = (rbt) => { let f = 1; for (const x of tab.faixas) if (rbt > x.ate) f++; return Math.min(f, 6); };
const aliqEf = (anexo, rbt, f) => { const t = tab.anexos[anexo][f - 1]; return rbt > 0 ? (rbt * t.aliq - t.deduzir) / rbt : tab.anexos[anexo][0].aliq; };
const issPct = (anexo, a, f) => { const s = tab.anexos[anexo][f - 1].partilha.ISS; if (!s) return 0; return Math.max(ISS_MIN, Math.min(ISS_MAX, a * s)); };

// ---------- monta os dados ----------
const hist = []; // receita 2025 para RBT12
const folhaRows = [];
const fech = [];
const receitaRbt = {}; // cod -> ym -> valor usado no RBT12 (2025 + 2026)
const folhaTot = {}; // cod -> ym -> total
for (const e of empresas) {
  const cod = e.codigo_cliente, ex = ext[cod], rec = sis.receitas[e.id] || {}, man = sis.manual[e.id] || {};
  receitaRbt[cod] = {}; folhaTot[cod] = {};
  for (let m = 1; m <= 12; m++) {
    const k = ym(ANO - 1, m);
    let v = null, fonte = "";
    const ph = prev.hist.get(`${cod}|${k}`);
    if (ex && ex.receitas[k] != null) { v = ex.receitas[k]; fonte = "PGDAS-D (extrato)"; }
    else if (ph && ph.fonte && !/^(Notas no sistema|Receita manual|PGDAS-D)/.test(ph.fonte)) { v = ph.v; fonte = ph.fonte; }
    else if (man[k] != null) { v = man[k]; fonte = "Receita manual (sistema)"; }
    else if (rec[k]) { v = r2(rec[k].normal + rec[k].retido); fonte = "Notas no sistema"; }
    else if (ph) { v = ph.v; fonte = ph.fonte || "Digitado na planilha"; }
    if (v != null) { hist.push({ cod, d: dt(ANO - 1, m), v, fonte }); receitaRbt[cod][k] = v; }
  }
  const fol = sis.folha[e.id] || {};
  for (const k of Object.keys(fol).sort()) {
    const [y, m] = k.split("-").map(Number); const f = fol[k];
    const total = f.valor + (f.proLabore || 0) + (f.fgts || 0);
    folhaRows.push({ cod, d: dt(y, m), bruta: f.valor, pl: f.proLabore, fgts: f.fgts, total });
    folhaTot[cod][k] = total;
  }
}
const abertura = (e) => e.data_abertura ? new Date(e.data_abertura + "T00:00:00Z") : null;
const mesesAtiv = (e, y, m) => { const a = abertura(e); if (!a) return 12; const n = (y - a.getUTCFullYear()) * 12 + (m - 1 - a.getUTCMonth()); return Math.max(0, Math.min(12, n)); };

for (const e of empresas) {
  const cod = e.codigo_cliente, ex = ext[cod], rec = sis.receitas[e.id] || {}, man = sis.manual[e.id] || {};
  const fr = !!e.sujeito_fator_r;
  for (let m = 1; m <= 12; m++) {
    const k = ym(ANO, m);
    const p = prev.linhas.get(`${cod}|${k}`) || {};
    const row = { cod, nome: e.trade_name || e.legal_name, d: dt(ANO, m), y: ANO, m, fr, b: { F: 0, G: 0, H: 0, I: 0, J: 0, K: 0, L: 0, M: 0, N: 0, O: 0 }, fonte: "", ar: p.AR ?? null, as: p.AS ?? null, obs: p.BD ?? null };
    const BUCK = ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O"];
    const prevRec = BUCK.some((c) => typeof p[c] === "number" && p[c] !== 0);
    const digitado = prevRec && p.BE !== "Notas no sistema" && p.BE !== "Receita manual (sistema)";
    // Receita: o que foi digitado na planilha vence; senão o sistema (manual > notas); senão o que já estava.
    if (digitado) { for (const c of BUCK) row.b[c] = typeof p[c] === "number" ? p[c] : 0; row.fonte = p.BE || "Digitado na planilha"; }
    else if (man[k] != null) { row.b[fr ? "N" : "H"] = man[k]; row.fonte = "Receita manual (sistema)"; }
    else if (rec[k]) { row.b[fr ? "N" : "H"] = r2(rec[k].normal); row.b[fr ? "O" : "I"] = r2(rec[k].retido); row.fonte = "Notas no sistema"; }
    row.total = Object.values(row.b).reduce((a, x) => a + x, 0);
    row.declRec = (ex && (ex.rpaPorPA[k] ?? ex.receitas[k])) ?? (typeof p.Q === "number" ? p.Q : null);
    row.declDas = (ex && ex.dasPorPA[k]) ?? (typeof p.AP === "number" ? p.AP : null);
    receitaRbt[cod][k] = row.declRec != null ? row.declRec : row.total;
    fech.push(row);
  }
}
// calcula
for (const r of fech) {
  const e = empresas.find((x) => x.codigo_cliente === r.cod);
  let rbt = 0, fs12 = 0;
  for (let i = 1; i <= 12; i++) { const d = new Date(Date.UTC(r.y, r.m - 1 - i, 1)); const k = ym(d.getUTCFullYear(), d.getUTCMonth() + 1); rbt += receitaRbt[r.cod][k] || 0; fs12 += folhaTot[r.cod][k] || 0; }
  const n = mesesAtiv(e, r.y, r.m);
  r.n = n; r.rbt12 = rbt; r.fs12 = fs12;
  r.rbtU = n >= 12 ? rbt : n <= 0 ? r.total * 12 : rbt / n * 12;
  r.fsU = n <= 0 || n >= 12 ? fs12 : fs12 / n * 12;
  r.faixa = r.rbtU <= 0 ? 1 : faixaDe(r.rbtU);
  // Res. CGSN 140, art. 26: sem receita nos 12 meses anteriores, Fator R = 0,28 se houve folha e 0,01 se não houve.
  r.fatorR = rbt === 0 ? (fs12 > 0 ? LIMIAR_FR : 0.01) : r.rbtU > 0 ? r.fsU / r.rbtU : 0;
  r.anexoFR = r.fr ? (r.fatorR >= LIMIAR_FR ? "III" : "V") : "III";
  const a = {}; for (const x of ANEXOS) a[x] = aliqEf(x, r.rbtU, r.faixa);
  const iss = { III: issPct("III", a.III, r.faixa), IV: issPct("IV", a.IV, r.faixa), V: issPct("V", a.V, r.faixa) };
  const b = r.b, X = r.anexoFR;
  r.das = r2(b.F * a.I + b.G * a.II + (b.H + b.I) * a.III - b.I * iss.III + (b.J + b.K) * a.IV - b.K * iss.IV + (b.L + b.M) * a.V - b.M * iss.V + (b.N + b.O) * a[X] - b.O * iss[X]);
}



// ---------- planilha (layout SOMA) ----------
await (async () => {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SOMA Contabilidade Integrada"; wb.calcProperties.fullCalcOnLoad = true;
  const C = { navy: "FF1F3550", navy2: "FF2C4A6B", navyDeep: "FF101A2C", gold: "FFC9A13B", goldPale: "FFF6EEDB", goldLight: "FFE3C583", ink: "FF1B2233", gray: "FF6B7280", line: "FFD9DEE5", bg: "FFF5F6F8", white: "FFFFFFFF", slate: "FF4A5D78", green: "FF2E7D5B", greenSoft: "FFE3F1EA", red: "FFB42318", redSoft: "FFFBE4E2", amber: "FF9A6B00", amberSoft: "FFFFF3D6", orangeSoft: "FFFCE9DC" };
  const FONT = "Segoe UI";
  const moeda = '#,##0.00;[Red]-#,##0.00', moeda0 = 'R$ #,##0;[Red]-R$ #,##0', pct = '0.00%', pct1 = '0.0%', mesFmt = 'mmm/yy', mesLongo = 'mmmm "de" yyyy';
  const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
  const thin = (argb = C.line) => ({ style: "thin", color: { argb } });
  const entrada = fill(C.goldPale);
  const logoId = wb.addImage({ buffer: logoBuf, extension: "png" });
  const iconId = wb.addImage({ buffer: iconBuf, extension: "png" });
  const ABAS = {}; for (const nome of ["Painel", "Fechamento", "Empresa", "Folha", "Histórico", "Empresas", "Tabelas", "Como usar"]) ABAS[nome] = wb.addWorksheet(nome, { views: [{ showGridLines: false }] });
  ABAS["Painel"].properties.tabColor = { argb: C.gold }; ABAS["Fechamento"].properties.tabColor = { argb: C.navy }; ABAS["Empresa"].properties.tabColor = { argb: C.navy };
  for (const n of ["Folha", "Histórico", "Empresas"]) ABAS[n].properties.tabColor = { argb: C.slate };
  for (const n of ["Tabelas", "Como usar"]) ABAS[n].properties.tabColor = { argb: "FF9CA3AF" };

  // cabeçalho de marca: logo + título + linha dourada
  const banner = (ws, titulo, subtitulo, ultimaCol, altura = 3) => {
    for (let r = 1; r <= altura; r++) ws.getRow(r).height = r === 1 ? 30 : 22;
    ws.addImage(iconId, { tl: { col: 0.25, row: 0.25 }, ext: { width: 46, height: 50 } });
    const t = ws.getCell("C1"); t.value = titulo; t.font = { name: FONT, size: 18, bold: true, color: { argb: C.navy } }; t.alignment = { vertical: "middle" };
    const s = ws.getCell("C2"); s.value = subtitulo; s.font = { name: FONT, size: 10, color: { argb: C.gold }, bold: true }; s.alignment = { vertical: "middle" };
    for (let c = 1; c <= ultimaCol; c++) ws.getCell(altura, c).border = { bottom: { style: "medium", color: { argb: C.gold } } };
  };
  const cabTabela = (ws, row, cor = C.navy, fonteCor = C.white) => { const r = ws.getRow(row); r.eachCell({ includeEmpty: false }, (c) => { c.font = { name: FONT, bold: true, size: 9, color: { argb: fonteCor } }; c.fill = fill(cor); c.alignment = { vertical: "middle", horizontal: "center", wrapText: true }; c.border = { bottom: thin(C.gold) }; }); r.height = 34; };
  const corpo = (ws, r1, r2, c1, c2) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const cell = ws.getCell(r, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; } };

  // ===== Tabelas =====
  const wt = ABAS["Tabelas"];
  banner(wt, "Tabelas do Simples Nacional", "LC 123/2006 — Anexos I a V, faixas e partilha", 12);
  const T0 = 5;
  wt.getRow(T0).values = ["Faixa", "RBT12 até", "I alíq.", "I deduzir", "II alíq.", "II deduzir", "III alíq.", "III deduzir", "IV alíq.", "IV deduzir", "V alíq.", "V deduzir"]; cabTabela(wt, T0);
  tab.faixas.forEach((f, i) => { const row = [f.faixa, f.ate]; for (const x of ANEXOS) row.push(tab.anexos[x][i].aliq, tab.anexos[x][i].deduzir); wt.getRow(T0 + 1 + i).values = row; });
  corpo(wt, T0 + 1, T0 + 6, 1, 12);
  for (let r = T0 + 1; r <= T0 + 6; r++) { wt.getCell(r, 2).numFmt = moeda; for (let c = 3; c <= 12; c += 2) { wt.getCell(r, c).numFmt = pct; wt.getCell(r, c + 1).numFmt = moeda; } }
  const FX = { ini: T0 + 1, fim: T0 + 6 };
  const PART_ROW = {}; let pr = T0 + 9;
  for (const x of ANEXOS) {
    const h = wt.getCell(`A${pr}`); h.value = `Partilha — Anexo ${x}`; h.font = { name: FONT, bold: true, color: { argb: C.navy } };
    wt.getRow(pr + 1).values = ["Faixa", ...TRIB]; cabTabela(wt, pr + 1, C.slate);
    PART_ROW[x] = pr + 2;
    tab.anexos[x].forEach((t, i) => { wt.getRow(pr + 2 + i).values = [i + 1, ...TRIB.map((k) => t.partilha[k])]; for (let c = 2; c <= 9; c++) wt.getCell(pr + 2 + i, c).numFmt = pct; });
    corpo(wt, pr + 2, pr + 7, 1, 9);
    pr += 10;
  }
  wt.getCell("N5").value = "Parâmetros"; wt.getCell("N5").font = { name: FONT, bold: true, color: { argb: C.navy } };
  const params = [["Fator R mínimo p/ Anexo III", LIMIAR_FR], ["ISS — alíquota máxima", ISS_MAX], ["ISS — alíquota mínima", ISS_MIN]];
  params.forEach(([k, v], i) => { wt.getCell(`N${6 + i}`).value = k; const c = wt.getCell(`O${6 + i}`); c.value = v; c.numFmt = pct; c.fill = entrada; });
  const P_FR = "Tabelas!$O$6", P_ISSMAX = "Tabelas!$O$7", P_ISSMIN = "Tabelas!$O$8";
  wt.getCell("N10").value = "Mudou a lei? Altere só esta aba — o resto recalcula."; wt.getCell("N10").font = { name: FONT, italic: true, size: 9, color: { argb: C.gray } };
  wt.getColumn(14).width = 30; wt.getColumn(2).width = 14; for (let c = 3; c <= 12; c++) wt.getColumn(c).width = 11;
  const aliqCol = { I: "C", II: "E", III: "G", IV: "I", V: "K" }, dedCol = { I: "D", II: "F", III: "H", IV: "J", V: "L" };
  const partCol = Object.fromEntries(TRIB.map((t, i) => [t, String.fromCharCode(66 + i)]));
  const PART = (x, t, f) => `INDEX(Tabelas!$${partCol[t]}$${PART_ROW[x]}:$${partCol[t]}$${PART_ROW[x] + 5},${f})`;
  const ALIQ = (x, f) => `INDEX(Tabelas!$${aliqCol[x]}$${FX.ini}:$${aliqCol[x]}$${FX.fim},${f})`;
  const DED = (x, f) => `INDEX(Tabelas!$${dedCol[x]}$${FX.ini}:$${dedCol[x]}$${FX.fim},${f})`;

  // ===== Empresas =====
  const we = ABAS["Empresas"];
  we.columns = [{ key: "a", width: 9 }, { key: "b", width: 50 }, { key: "c", width: 19 }, { key: "d", width: 22 }, { key: "e", width: 12 }, { key: "f", width: 12 }];
  we.getRow(1).values = ["Código", "Empresa", "CNPJ", "Município", "Abertura", "Sujeita ao Fator R"]; cabTabela(we, 1);
  empresas.forEach((e) => we.addRow([e.codigo_cliente, e.trade_name || e.legal_name, e.cnpj ? e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "", e.municipality_name, abertura(e), e.sujeito_fator_r ? "Sim" : "Não"]));
  const NE = empresas.length + 1;
  corpo(we, 2, NE, 1, 6); for (let r = 2; r <= NE; r++) { we.getCell(`E${r}`).numFmt = "dd/mm/yyyy"; we.getCell(`F${r}`).fill = entrada; we.getCell(`E${r}`).fill = entrada; }
  we.getCell(`F2`).dataValidation = undefined;
  for (let r = 2; r <= NE; r++) we.getCell(`F${r}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"Sim,Não"'] };
  we.views = [{ state: "frozen", ySplit: 1, showGridLines: false }]; we.autoFilter = `A1:F${NE}`;

  // ===== Histórico =====
  const wh = ABAS["Histórico"];
  wh.columns = [{ width: 9 }, { width: 13 }, { width: 16 }, { width: 30 }];
  wh.getRow(1).values = ["Código", "Competência", `Receita ${ANO - 1}`, "Fonte"]; cabTabela(wh, 1);
  hist.forEach((h) => wh.addRow([h.cod, h.d, h.v, h.fonte]));
  corpo(wh, 2, hist.length + 1, 1, 4); for (let r = 2; r <= hist.length + 1; r++) { wh.getCell(`B${r}`).numFmt = mesFmt; wh.getCell(`C${r}`).numFmt = moeda; }
  const NH = hist.length + 1 + 2000;
  wh.views = [{ state: "frozen", ySplit: 1, showGridLines: false }]; wh.autoFilter = "A1:D1";

  // ===== Folha =====
  const wf = ABAS["Folha"];
  wf.columns = [{ width: 9 }, { width: 13 }, { width: 16 }, { width: 14 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 16 }];
  wf.getRow(1).values = ["Código", "Competência", "Folha bruta / total oficial", "INSS emp./terc.", "FGTS", "Pró-labore", "Autônomos", "Total p/ Fator R"]; cabTabela(wf, 1);
  folhaRows.forEach((f, i) => { const r = i + 2; wf.addRow([f.cod, f.d, f.bruta, null, f.fgts, f.pl, null, { formula: `SUM(C${r}:G${r})`, result: f.total }]); });
  const NF = folhaRows.length + 1 + 3000;
  for (let r = folhaRows.length + 2; r <= NF; r++) wf.getCell(`H${r}`).value = { formula: `IF(A${r}="","",SUM(C${r}:G${r}))` };
  corpo(wf, 2, folhaRows.length + 1, 1, 8);
  for (let r = 2; r <= NF; r++) { wf.getCell(`B${r}`).numFmt = mesFmt; for (const c of ["C", "D", "E", "F", "G", "H"]) wf.getCell(`${c}${r}`).numFmt = moeda; }
  wf.views = [{ state: "frozen", ySplit: 1, showGridLines: false }]; wf.autoFilter = "A1:H1";

  // ===== Fechamento =====
  const w = ABAS["Fechamento"];
  const HDR = 5, R0 = 6; // linha do cabeçalho e 1ª linha de dados
  const cols = [
    ["A", "Chave", 4, "id"], ["B", "Código", 8, "id"], ["C", "Empresa", 36, "id"], ["D", "Compet.", 9, "id"], ["E", "Fator R?", 7, "id"],
    ["F", "Anexo I", 11, "rec"], ["G", "Anexo II", 11, "rec"], ["H", "Anexo III", 12, "rec"], ["I", "III retido", 11, "rec"], ["J", "Anexo IV", 11, "rec"], ["K", "IV retido", 11, "rec"], ["L", "Anexo V", 11, "rec"], ["M", "V retido", 11, "rec"], ["N", "III/V Fator R", 12, "rec"], ["O", "III/V retido", 12, "rec"],
    ["P", "Receita total", 13, "tot"], ["Q", "Receita declarada PGDAS-D", 13, "tot"], ["R", "Receita p/ RBT12", 13, "tot"],
    ["S", "Meses de atividade", 8, "rbt"], ["T", "RBT12", 13, "rbt"], ["U", "RBT12 usado", 13, "rbt"], ["V", "Faixa", 6, "rbt"], ["W", "Folha 12m", 12, "rbt"], ["X", "Folha 12m usada", 12, "rbt"], ["Y", "Fator R", 8, "rbt"], ["Z", "Anexo do Fator R", 8, "rbt"],
    ["AA", "Alíq. ef. I", 8, "calc"], ["AB", "Alíq. ef. II", 8, "calc"], ["AC", "Alíq. ef. III", 8, "calc"], ["AD", "Alíq. ef. IV", 8, "calc"], ["AE", "Alíq. ef. V", 8, "calc"], ["AF", "ISS % III", 7, "calc"], ["AG", "ISS % IV", 7, "calc"], ["AH", "ISS % V", 7, "calc"],
    ["AI", "DAS I", 10, "calc"], ["AJ", "DAS II", 10, "calc"], ["AK", "DAS III", 10, "calc"], ["AL", "DAS IV", 10, "calc"], ["AM", "DAS V", 10, "calc"], ["AN", "DAS Fator R", 10, "calc"],
    ["AO", "DAS calculado", 12, "das"], ["AP", "DAS declarado PGDAS-D", 12, "das"], ["AQ", "Diferença", 10, "das"], ["AR", "Compensação", 11, "das"], ["AS", "Pago", 11, "das"], ["AT", "A pagar", 11, "das"], ["AU", "Situação", 16, "das"],
    ["AV", "IRPJ", 9, "part"], ["AW", "CSLL", 9, "part"], ["AX", "COFINS", 9, "part"], ["AY", "PIS", 9, "part"], ["AZ", "CPP", 9, "part"], ["BA", "IPI", 8, "part"], ["BB", "ISS", 9, "part"], ["BC", "ICMS", 8, "part"],
    ["BD", "Observação", 30, "obs"], ["BE", "Fonte da receita", 18, "obs"], ["BF", "Ordem pendência", 6, "obs"],
  ];
  const GRUPO = { id: ["Empresa", C.navy, C.white], rec: ["Receita do mês por anexo  (digite aqui)", C.gold, C.navyDeep], tot: ["Receita", C.navy2, C.white], rbt: ["RBT12 e Fator R", C.slate, C.white], calc: ["Cálculo por anexo", "FF8A94A6", C.white], das: ["DAS do mês", C.navy, C.white], part: ["Partilha do DAS calculado", C.slate, C.white], obs: ["Controle", "FF8A94A6", C.white] };
  cols.forEach(([c, , wd]) => (w.getColumn(c).width = wd));
  banner(w, `Fechamento do Simples Nacional ${ANO}`, "SOMA Contabilidade Integrada · uma linha por empresa e mês — filtre por Competência ou Código", 57);
  // faixa de grupos (linha 4) e cabeçalho (linha 5)
  let gi = 0;
  while (gi < cols.length) {
    const g = cols[gi][3]; let gj = gi; while (gj + 1 < cols.length && cols[gj + 1][3] === g) gj++;
    const [titulo, cor, fc] = GRUPO[g];
    if (gj > gi) w.mergeCells(`${cols[gi][0]}4:${cols[gj][0]}4`);
    const cell = w.getCell(`${cols[gi][0]}4`); cell.value = titulo; cell.font = { name: FONT, bold: true, size: 9, color: { argb: fc } }; cell.alignment = { horizontal: "center", vertical: "middle" };
    for (let k = gi; k <= gj; k++) { w.getCell(`${cols[k][0]}4`).fill = fill(cor); const h = w.getCell(`${cols[k][0]}${HDR}`); h.value = cols[k][1]; h.font = { name: FONT, bold: true, size: 9, color: { argb: fc } }; h.fill = fill(cor); h.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; h.border = { bottom: { style: "medium", color: { argb: C.gold } }, right: thin("FFFFFFFF") }; }
    gi = gj + 1;
  }
  w.getRow(4).height = 20; w.getRow(HDR).height = 36;
  const N = R0 + fech.length - 1;
  const rng = (c) => `$${c}$${R0}:$${c}$${N}`;
  const SEL = "Painel!$C$5"; // competência escolhida no Painel
  const tribCol = { IRPJ: "AV", CSLL: "AW", COFINS: "AX", PIS: "AY", CPP: "AZ", IPI: "BA", ISS: "BB", ICMS: "BC" };
  const fmt = {};
  for (const c of ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "T", "U", "W", "X", "AI", "AJ", "AK", "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AV", "AW", "AX", "AY", "AZ", "BA", "BB", "BC"]) fmt[c] = moeda;
  for (const c of ["Y", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"]) fmt[c] = pct;
  fmt.D = mesFmt;
  fech.forEach((r, i) => {
    const n = R0 + i, b = r.b;
    const set = (c, v) => { const cell = w.getCell(`${c}${n}`); cell.value = v; };
    set("A", { formula: `B${n}&"|"&(YEAR(D${n})*100+MONTH(D${n}))`, result: `${r.cod}|${r.y * 100 + r.m}` });
    set("B", r.cod); set("C", { formula: `IFERROR(INDEX(Empresas!$B$2:$B$${NE},MATCH(B${n},Empresas!$A$2:$A$${NE},0)),"")`, result: r.nome });
    set("D", r.d);
    set("E", { formula: `IFERROR(INDEX(Empresas!$F$2:$F$${NE},MATCH(B${n},Empresas!$A$2:$A$${NE},0)),"Não")`, result: r.fr ? "Sim" : "Não" });
    for (const c of ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O"]) set(c, b[c] || null);
    set("P", { formula: `SUM(F${n}:O${n})`, result: r.total });
    set("Q", r.declRec);
    set("R", { formula: `IF(Q${n}<>"",Q${n},P${n})`, result: r.declRec != null ? r.declRec : r.total });
    set("S", { formula: `IFERROR(MAX(0,MIN(12,(YEAR(D${n})-YEAR(INDEX(Empresas!$E$2:$E$${NE},MATCH(B${n},Empresas!$A$2:$A$${NE},0))))*12+MONTH(D${n})-MONTH(INDEX(Empresas!$E$2:$E$${NE},MATCH(B${n},Empresas!$A$2:$A$${NE},0))))),12)`, result: r.n });
    set("T", { formula: `SUMIFS(Histórico!$C$2:$C$${NH},Histórico!$A$2:$A$${NH},B${n},Histórico!$B$2:$B$${NH},">="&EDATE(D${n},-12),Histórico!$B$2:$B$${NH},"<"&D${n})+SUMIFS(${rng("R")},${rng("B")},B${n},${rng("D")},">="&EDATE(D${n},-12),${rng("D")},"<"&D${n})`, result: r.rbt12 });
    set("U", { formula: `IF(S${n}>=12,T${n},IF(S${n}<=0,P${n}*12,T${n}/S${n}*12))`, result: r.rbtU });
    set("V", { formula: `IF(U${n}<=0,1,MIN(6,COUNTIF(Tabelas!$B$${FX.ini}:$B$${FX.fim},"<"&U${n})+1))`, result: r.faixa });
    set("W", { formula: `SUMIFS(Folha!$H$2:$H$${NF},Folha!$A$2:$A$${NF},B${n},Folha!$B$2:$B$${NF},">="&EDATE(D${n},-12),Folha!$B$2:$B$${NF},"<"&D${n})`, result: r.fs12 });
    set("X", { formula: `IF(OR(S${n}<=0,S${n}>=12),W${n},W${n}/S${n}*12)`, result: r.fsU });
    set("Y", { formula: `IF(T${n}=0,IF(W${n}>0,${P_FR},0.01),IF(U${n}>0,X${n}/U${n},0))`, result: r.fatorR });
    set("Z", { formula: `IF(E${n}="Sim",IF(Y${n}>=${P_FR},"III","V"),"III")`, result: r.anexoFR });
    const ali = { I: "AA", II: "AB", III: "AC", IV: "AD", V: "AE" };
    for (const x of ANEXOS) set(ali[x], { formula: `IF(U${n}>0,(U${n}*${ALIQ(x, `V${n}`)}-${DED(x, `V${n}`)})/U${n},${ALIQ(x, 1)})` });
    const issC = { III: "AF", IV: "AG", V: "AH" };
    for (const x of ["III", "IV", "V"]) set(issC[x], { formula: `IF(${PART(x, "ISS", `V${n}`)}=0,0,MAX(${P_ISSMIN},MIN(${P_ISSMAX},${ali[x]}${n}*${PART(x, "ISS", `V${n}`)})))` });
    set("AI", { formula: `F${n}*AA${n}` }); set("AJ", { formula: `G${n}*AB${n}` });
    set("AK", { formula: `(H${n}+I${n})*AC${n}-I${n}*AF${n}` });
    set("AL", { formula: `(J${n}+K${n})*AD${n}-K${n}*AG${n}` });
    set("AM", { formula: `(L${n}+M${n})*AE${n}-M${n}*AH${n}` });
    set("AN", { formula: `IF(Z${n}="III",(N${n}+O${n})*AC${n}-O${n}*AF${n},(N${n}+O${n})*AE${n}-O${n}*AH${n})` });
    set("AO", { formula: `ROUND(SUM(AI${n}:AN${n}),2)`, result: r.das });
    set("AP", r.declDas);
    set("AQ", { formula: `IF(AP${n}="","",AO${n}-AP${n})`, result: r.declDas != null ? r2(r.das - r.declDas) : "" });
    set("AT", { formula: `IF(AP${n}<>"",AP${n},AO${n})-N(AR${n})-N(AS${n})` });
    set("AU", { formula: `IF(AND(P${n}=0,AP${n}=""),"Sem movimento",IF(AP${n}="",IF(Q${n}<>"","DAS não informado","Falta declarar"),IF(ABS(AQ${n})<=0.05,"Bate",IF(AND(Q${n}<>"",ABS(P${n}-Q${n})>0.01),"Receita diferente","Divergente"))))` });
    for (const t of TRIB) {
      let f;
      if (t === "ISS") f = `H${n}*AF${n}+J${n}*AG${n}+L${n}*AH${n}+N${n}*IF(Z${n}="III",AF${n},AH${n})+F${n}*AA${n}*${PART("I", "ISS", `V${n}`)}+G${n}*AB${n}*${PART("II", "ISS", `V${n}`)}`;
      else {
        const sv = (x, R, a, iss) => `(${R})*(${a}-${iss})*${PART(x, t, `V${n}`)}/(1-${PART(x, "ISS", `V${n}`)})`;
        f = `F${n}*AA${n}*${PART("I", t, `V${n}`)}+G${n}*AB${n}*${PART("II", t, `V${n}`)}+${sv("III", `H${n}+I${n}`, `AC${n}`, `AF${n}`)}+${sv("IV", `J${n}+K${n}`, `AD${n}`, `AG${n}`)}+${sv("V", `L${n}+M${n}`, `AE${n}`, `AH${n}`)}+IF(Z${n}="III",${sv("III", `N${n}+O${n}`, `AC${n}`, `AF${n}`)},${sv("V", `N${n}+O${n}`, `AE${n}`, `AH${n}`)})`;
      }
      set(tribCol[t], { formula: f });
    }
    set("AR", r.ar); set("AS", r.as); set("BD", r.obs);
    set("BE", r.fonte);
    // ordem de pendência no mês escolhido no Painel (maior valor em jogo primeiro); vazio = não é pendência
    set("BF", { formula: `IF(AND(D${n}=${SEL},OR(AU${n}="Divergente",AU${n}="Receita diferente",AU${n}="Falta declarar")),IF(AU${n}="Falta declarar",AO${n},ABS(N(AQ${n})))+ROW()/1000000000,"")` });
    for (let c = 1; c <= 58; c++) { const cell = w.getCell(n, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin("FFEEF0F3") }; }
    for (const [c, f] of Object.entries(fmt)) w.getCell(`${c}${n}`).numFmt = f;
    for (const c of ["F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "Q", "AP", "AR", "AS", "BD"]) w.getCell(`${c}${n}`).fill = entrada;
    for (const c of ["P", "AO", "AT"]) w.getCell(`${c}${n}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.navy } };
    w.getCell(`B${n}`).alignment = { horizontal: "center" }; w.getCell(`E${n}`).alignment = { horizontal: "center" }; w.getCell(`V${n}`).alignment = { horizontal: "center" }; w.getCell(`Z${n}`).alignment = { horizontal: "center" }; w.getCell(`AU${n}`).alignment = { horizontal: "center" };
    // separa visualmente uma empresa da outra
    if (r.m === 12) for (let c = 1; c <= 58; c++) w.getCell(n, c).border = { bottom: thin("FFB8C2D1") };
  });
  const sitStyle = (txt, bg, fc) => ({ type: "containsText", operator: "containsText", text: txt, style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: bg } }, font: { color: { argb: fc }, bold: true } } });
  w.addConditionalFormatting({ ref: `AU${R0}:AU${N}`, rules: [sitStyle("Bate", C.greenSoft, C.green), sitStyle("Divergente", C.redSoft, C.red), sitStyle("Receita diferente", C.orangeSoft, "FFB54708"), sitStyle("Falta declarar", C.amberSoft, C.amber), sitStyle("Sem movimento", "FFF1F2F4", C.gray), sitStyle("DAS não informado", "FFEAF0F7", C.slate)] });
  w.addConditionalFormatting({ ref: `AQ${R0}:AQ${N}`, rules: [{ type: "expression", formulae: [`AND(AQ${R0}<>"",ABS(AQ${R0})>0.05)`], style: { font: { color: { argb: C.red }, bold: true } } }] });
  for (const c of ["A", "S", "T", "W", "X", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK", "AL", "AM", "AN", "BF"]) w.getColumn(c).outlineLevel = 1;
  w.getColumn("A").hidden = true; w.getColumn("BF").hidden = true;
  w.views = [{ state: "frozen", xSplit: 4, ySplit: HDR, showGridLines: false, zoomScale: 90 }];
  w.autoFilter = `A${HDR}:BE${N}`;

  // ===== Painel =====
  const wp = ABAS["Painel"];
  for (let c = 1; c <= 18; c++) wp.getColumn(c).width = c === 1 ? 2 : 11.5;
  wp.getColumn(19).width = 3;
  banner(wp, `Painel do Fechamento — Simples Nacional ${ANO}`, `SOMA Contabilidade Integrada · ${empresas.length} empresas do Simples · dados de ${DATA_GERACAO}`, 18);
  wp.addImage(logoId, { tl: { col: 15.6, row: 0.15 }, ext: { width: 92, height: 72 } });
  wp.getCell("B5").value = "Competência"; wp.getCell("B5").font = { name: FONT, bold: true, size: 10, color: { argb: C.navy } }; wp.getCell("B5").alignment = { vertical: "middle" };
  const sel = wp.getCell("C5"); sel.value = dt(ANO, 9); sel.numFmt = mesLongo; sel.fill = fill(C.navy); sel.font = { name: FONT, bold: true, size: 12, color: { argb: C.white } }; sel.alignment = { horizontal: "center", vertical: "middle" };
  wp.mergeCells("C5:D5");
  wp.getCell("E5").value = "◀ escolha o mês na lista — o painel inteiro recalcula"; wp.getCell("E5").font = { name: FONT, italic: true, size: 9, color: { argb: C.gray } }; wp.getCell("E5").alignment = { vertical: "middle" };
  wp.getRow(5).height = 26;
  // dados auxiliares dos gráficos (colunas U em diante)
  const AUXC = 21; // U
  const aux = (r, c) => wp.getCell(r, AUXC + c);
  aux(4, 0).value = "Dados dos gráficos (calculados)"; aux(4, 0).font = { name: FONT, bold: true, size: 9, color: { argb: C.gray } };
  ["Mês", "Receita", "DAS calculado", "DAS declarado"].forEach((h, i) => { const c = aux(5, i); c.value = h; c.font = { name: FONT, bold: true, size: 9 }; });
  const FD = `Fechamento!$D$${R0}:$D$${N}`;
  for (let m = 1; m <= 12; m++) {
    const r = 5 + m;
    aux(r, 0).value = dt(ANO, m); aux(r, 0).numFmt = mesFmt;
    aux(r, 1).value = { formula: `SUMIFS(Fechamento!$P$${R0}:$P$${N},${FD},$U${r})` };
    aux(r, 2).value = { formula: `SUMIFS(Fechamento!$AO$${R0}:$AO$${N},${FD},$U${r})` };
    aux(r, 3).value = { formula: `SUMIFS(Fechamento!$AP$${R0}:$AP$${N},${FD},$U${r})` };
    for (let i = 1; i <= 3; i++) aux(r, i).numFmt = moeda0;
  }
  sel.dataValidation = { type: "list", allowBlank: false, formulae: [`$U$6:$U$17`] };
  const SITS = ["Bate", "Receita diferente", "Divergente", "Falta declarar", "DAS não informado", "Sem movimento"];
  aux(19, 0).value = "Situação"; aux(19, 1).value = "Empresas";
  SITS.forEach((s, i) => { aux(20 + i, 0).value = s; aux(20 + i, 1).value = { formula: `COUNTIFS(${FD},$C$5,Fechamento!$AU$${R0}:$AU$${N},U${20 + i})` }; });
  aux(26, 0).value = "Anexo"; aux(26, 1).value = "Empresas";
  const anexoRows = [["III (Fator R ≥ 28%)", `COUNTIFS(${FD},$C$5,Fechamento!$E$${R0}:$E$${N},"Sim",Fechamento!$Z$${R0}:$Z$${N},"III",Fechamento!$P$${R0}:$P$${N},">0")`], ["V (Fator R < 28%)", `COUNTIFS(${FD},$C$5,Fechamento!$E$${R0}:$E$${N},"Sim",Fechamento!$Z$${R0}:$Z$${N},"V",Fechamento!$P$${R0}:$P$${N},">0")`], ["III fixo (sem Fator R)", `COUNTIFS(${FD},$C$5,Fechamento!$E$${R0}:$E$${N},"Não",Fechamento!$P$${R0}:$P$${N},">0")`]];
  anexoRows.forEach(([k, f], i) => { aux(27 + i, 0).value = k; aux(27 + i, 1).value = { formula: f }; });
  aux(31, 0).value = "Faixa"; aux(31, 1).value = "Empresas";
  for (let f = 1; f <= 6; f++) { aux(31 + f, 0).value = `Faixa ${f}`; aux(31 + f, 1).value = { formula: `COUNTIFS(${FD},$C$5,Fechamento!$V$${R0}:$V$${N},${f},Fechamento!$P$${R0}:$P$${N},">0")` }; }
  for (let r = 4; r <= 38; r++) for (let c = 0; c <= 3; c++) { const cell = aux(r, c); if (!cell.font || !cell.font.bold) cell.font = { name: FONT, size: 9, color: { argb: C.gray } }; }
  for (let c = AUXC; c <= AUXC + 3; c++) wp.getColumn(c).width = 13;

  // cartões de indicadores
  const card = (r, c, titulo, formula, numFmt, nota, destaque = C.navy) => {
    const col = (k) => String.fromCharCode(64 + c + k);
    wp.mergeCells(`${col(0)}${r}:${col(2)}${r}`); wp.mergeCells(`${col(0)}${r + 1}:${col(2)}${r + 1}`); wp.mergeCells(`${col(0)}${r + 2}:${col(2)}${r + 2}`);
    const t = wp.getCell(`${col(0)}${r}`); t.value = titulo.toUpperCase(); t.font = { name: FONT, size: 8, bold: true, color: { argb: C.gray } }; t.alignment = { vertical: "bottom", indent: 1 };
    const v = wp.getCell(`${col(0)}${r + 1}`); v.value = { formula }; v.numFmt = numFmt; v.font = { name: FONT, size: 20, bold: true, color: { argb: destaque } }; v.alignment = { vertical: "middle", indent: 1 };
    const s = wp.getCell(`${col(0)}${r + 2}`); s.value = typeof nota === "string" && nota.startsWith("=") ? { formula: nota.slice(1) } : nota; s.font = { name: FONT, size: 8, color: { argb: C.gray } }; s.alignment = { vertical: "top", indent: 1 };
    for (let k = 0; k <= 2; k++) for (let rr = r; rr <= r + 2; rr++) { const cell = wp.getCell(`${col(k)}${rr}`); cell.fill = fill(C.bg); }
    for (let rr = r; rr <= r + 2; rr++) wp.getCell(`${col(0)}${rr}`).border = { left: { style: "thick", color: { argb: destaque === C.navy ? C.gold : destaque } } };
  };
  const cnt = (s) => `COUNTIFS(${FD},$C$5,Fechamento!$AU$${R0}:$AU$${N},"${s}")`;
  const sm = (c) => `SUMIFS(Fechamento!$${c}$${R0}:$${c}$${N},${FD},$C$5)`;
  const ativas = `(COUNTIFS(${FD},$C$5)-${cnt("Sem movimento")})`;
  for (const r of [7, 8, 9, 11, 12, 13]) wp.getRow(r).height = r === 8 || r === 12 ? 34 : 16;
  card(7, 2, "Empresas com movimento", ativas, "0", `="de "&COUNTIFS(${FD},$C$5)&" no Simples"`);
  card(7, 5, "Fechadas (DAS bate)", `IFERROR(${cnt("Bate")}/${ativas},0)`, "0%", `=${cnt("Bate")}&" empresas conferidas"`, C.green);
  card(7, 8, "Pendências", `${cnt("Divergente")}+${cnt("Receita diferente")}`, "0", `=${cnt("Divergente")}&" divergentes · "&${cnt("Receita diferente")}&" receita diferente"`, C.red);
  card(7, 11, "Falta declarar", cnt("Falta declarar"), "0", "com receita e sem DAS no mês", C.amber);
  card(7, 14, "Receita do mês (sistema)", sm("P"), moeda0, `="declarada: R$ "&FIXED(${sm("Q")},0)`);
  card(11, 2, "DAS calculado", sm("AO"), moeda0, "soma das empresas no mês");
  card(11, 5, "DAS declarado (PGDAS-D)", sm("AP"), moeda0, `="a pagar: R$ "&FIXED(${sm("AT")},0)`);
  card(11, 8, "Diferença calculado − declarado", sm("AQ"), moeda0, "positivo = sistema calcula mais", C.red);
  card(11, 11, "Alíquota efetiva média", `IFERROR(${sm("AO")}/${sm("P")},0)`, pct1, "DAS calculado ÷ receita");
  card(11, 14, "Empresas no Anexo V", `V28`, "0", `="Fator R < 28% · "&V27&" no Anexo III"`, C.slate);
  // títulos das áreas de gráfico (os gráficos são inseridos depois, pelo Excel)
  const secao = (r, c1, c2, txt) => { wp.mergeCells(`${c1}${r}:${c2}${r}`); const cell = wp.getCell(`${c1}${r}`); cell.value = txt; cell.font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } }; for (let c = c1.charCodeAt(0); c <= c2.charCodeAt(0); c++) wp.getCell(`${String.fromCharCode(c)}${r}`).border = { bottom: thin(C.gold) }; };
  secao(15, "B", "J", `Receita × DAS — ${ANO}`); secao(15, "L", "R", "Situação das empresas no mês");
  secao(34, "B", "J", "Anexo aplicado no mês"); secao(34, "L", "R", "Empresas por faixa de RBT12");
  // pendências do mês
  const PR = 53;
  secao(PR, "B", "R", "Pendências do mês — maiores valores primeiro (clique no código e filtre no Fechamento)");
  const pcols = [["B", "Código"], ["C", "Empresa"], ["H", "Situação"], ["J", "Receita sistema"], ["K", "Receita declarada"], ["M", "DAS calculado"], ["N", "DAS declarado"], ["P", "Diferença"], ["Q", "Fator R"], ["R", "Anexo"]];
  wp.mergeCells(`C${PR + 1}:G${PR + 1}`); wp.mergeCells(`H${PR + 1}:I${PR + 1}`); wp.mergeCells(`K${PR + 1}:L${PR + 1}`); wp.mergeCells(`N${PR + 1}:O${PR + 1}`);
  pcols.forEach(([c, h]) => { const cell = wp.getCell(`${c}${PR + 1}`); cell.value = h; });
  for (let c = 2; c <= 18; c++) { const cell = wp.getCell(PR + 1, c); cell.font = { name: FONT, bold: true, size: 9, color: { argb: C.white } }; cell.fill = fill(C.navy); cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; }
  wp.getRow(PR + 1).height = 28;
  const BF = `Fechamento!$BF$${R0}:$BF$${N}`;
  const col = (c) => `Fechamento!$${c}$${R0}:$${c}$${N}`;
  for (let k = 1; k <= 25; k++) {
    const r = PR + 1 + k;
    const pos = `MATCH(LARGE(${BF},${k}),${BF},0)`;
    const pega = (c) => `IFERROR(INDEX(${col(c)},${pos}),"")`;
    wp.mergeCells(`C${r}:G${r}`); wp.mergeCells(`H${r}:I${r}`); wp.mergeCells(`K${r}:L${r}`); wp.mergeCells(`N${r}:O${r}`);
    const put = (c, f, nf) => { const cell = wp.getCell(`${c}${r}`); cell.value = { formula: f }; if (nf) cell.numFmt = nf; };
    put("B", pega("B")); put("C", pega("C")); put("H", pega("AU")); put("J", pega("P"), moeda); put("K", pega("Q"), moeda); put("M", pega("AO"), moeda); put("N", pega("AP"), moeda); put("P", pega("AQ"), moeda); put("Q", pega("Y"), pct1); put("R", pega("Z"));
    for (let c = 2; c <= 18; c++) { const cell = wp.getCell(r, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; if (k % 2 === 0) cell.fill = fill(C.bg); }
    for (const c of ["B", "H", "Q", "R"]) wp.getCell(`${c}${r}`).alignment = { horizontal: "center" };
    wp.getCell(`P${r}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.red } };
  }
  wp.addConditionalFormatting({ ref: `H${PR + 2}:H${PR + 26}`, rules: [sitStyle("Divergente", C.redSoft, C.red), sitStyle("Receita diferente", C.orangeSoft, "FFB54708"), sitStyle("Falta declarar", C.amberSoft, C.amber)] });
  wp.getCell(`B${PR + 28}`).value = { formula: `IF(COUNT(${BF})>25,"+ "&(COUNT(${BF})-25)&" pendências — filtre a coluna Situação no Fechamento","")` };
  wp.getCell(`B${PR + 28}`).font = { name: FONT, italic: true, size: 9, color: { argb: C.gray } };
  wp.views = [{ showGridLines: false, zoomScale: 90 }];

  // ===== Empresa =====
  const wv = ABAS["Empresa"];
  banner(wv, "Ficha anual da empresa", "Escolha o código — receita, RBT12, Fator R, DAS e partilha mês a mês", 20);
  wv.addImage(logoId, { tl: { col: 18.6, row: 0.15 }, ext: { width: 92, height: 72 } });
  wv.getCell("B5").value = "Código"; wv.getCell("B5").font = { name: FONT, bold: true, color: { argb: C.navy } }; wv.getCell("B5").alignment = { vertical: "middle" };
  const cs = wv.getCell("C5"); cs.value = empresas.find((e) => e.codigo_cliente === "064") ? "064" : empresas[0].codigo_cliente;
  cs.fill = fill(C.navy); cs.font = { name: FONT, bold: true, size: 13, color: { argb: C.white } }; cs.alignment = { horizontal: "center", vertical: "middle" };
  cs.dataValidation = { type: "list", allowBlank: false, formulae: [`Empresas!$A$2:$A$${NE}`] };
  const look = (c) => `IFERROR(INDEX(Empresas!$${c}$2:$${c}$${NE},MATCH($C$5,Empresas!$A$2:$A$${NE},0)),"")`;
  wv.mergeCells("D5:J5"); const nm = wv.getCell("D5"); nm.value = { formula: look("B") }; nm.font = { name: FONT, bold: true, size: 13, color: { argb: C.navy } }; nm.alignment = { vertical: "middle", indent: 1 };
  wv.getRow(5).height = 28;
  const info = [["K5", "CNPJ", "L5", look("C")], ["N5", "Município", "O5", look("D")], ["Q5", "Fator R?", "R5", look("F")]];
  for (const [lc, l, vc, f] of info) { wv.getCell(lc).value = l; wv.getCell(lc).font = { name: FONT, size: 8, bold: true, color: { argb: C.gray } }; wv.getCell(lc).alignment = { horizontal: "right", vertical: "middle" }; wv.getCell(vc).value = { formula: f }; wv.getCell(vc).font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } }; wv.getCell(vc).alignment = { vertical: "middle" }; }
  wv.mergeCells("L5:M5"); wv.mergeCells("O5:P5");
  const VH = 8;
  const vcols = [["B", "Mês", null, null], ["C", "Anexo III", "H", moeda], ["D", "III retido", "I", moeda], ["E", "Anexo V", "L", moeda], ["F", "V retido", "M", moeda], ["G", "III/V Fator R", "N", moeda], ["H", "III/V retido", "O", moeda], ["I", "Outros (I, II, IV)", "*", moeda], ["J", "Receita total", "P", moeda], ["K", "Declarada PGDAS-D", "Q", moeda], ["L", "RBT12 usado", "U", moeda], ["M", "Faixa", "V", "0"], ["N", "Folha 12m", "X", moeda], ["O", "Fator R", "Y", pct1], ["P", "Anexo", "Z", null], ["Q", "DAS calculado", "AO", moeda], ["R", "DAS declarado", "AP", moeda], ["S", "Diferença", "AQ", moeda], ["T", "Situação", "AU", null]];
  wv.mergeCells(`C${VH - 1}:J${VH - 1}`); wv.getCell(`C${VH - 1}`).value = "Receita do mês"; wv.mergeCells(`K${VH - 1}:P${VH - 1}`); wv.getCell(`K${VH - 1}`).value = "RBT12 e Fator R"; wv.mergeCells(`Q${VH - 1}:T${VH - 1}`); wv.getCell(`Q${VH - 1}`).value = "DAS";
  for (const [c, cor] of [["C", C.gold], ["K", C.slate], ["Q", C.navy]]) { const cell = wv.getCell(`${c}${VH - 1}`); cell.font = { name: FONT, bold: true, size: 9, color: { argb: cor === C.gold ? C.navyDeep : C.white } }; cell.fill = fill(cor); cell.alignment = { horizontal: "center" }; }
  vcols.forEach(([c, h]) => { wv.getCell(`${c}${VH}`).value = h; }); cabTabela(wv, VH);
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const FA = `Fechamento!$A$${R0}:$A$${N}`;
  for (let m = 1; m <= 12; m++) {
    const n = VH + m; const key = `$C$5&"|"&${ANO * 100 + m}`;
    wv.getCell(`B${n}`).value = MESES[m - 1];
    for (const [c, , src, f] of vcols.slice(1)) {
      let formula;
      if (src === "*") formula = ["F", "G", "J", "K"].map((x) => `SUMIFS(Fechamento!$${x}$${R0}:$${x}$${N},${FA},${key})`).join("+");
      else formula = `IFERROR(INDEX(Fechamento!$${src}$${R0}:$${src}$${N},MATCH(${key},${FA},0)),"")`;
      wv.getCell(`${c}${n}`).value = { formula }; if (f) wv.getCell(`${c}${n}`).numFmt = f;
    }
    for (let c = 2; c <= 20; c++) { const cell = wv.getCell(n, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; if (m % 2 === 0) cell.fill = fill(C.bg); }
    for (const c of ["J", "Q"]) wv.getCell(`${c}${n}`).font = { name: FONT, size: 9, bold: true, color: { argb: C.navy } };
    for (const c of ["M", "P", "T"]) wv.getCell(`${c}${n}`).alignment = { horizontal: "center" };
  }
  wv.addConditionalFormatting({ ref: `T${VH + 1}:T${VH + 12}`, rules: [sitStyle("Bate", C.greenSoft, C.green), sitStyle("Divergente", C.redSoft, C.red), sitStyle("Receita diferente", C.orangeSoft, "FFB54708"), sitStyle("Falta declarar", C.amberSoft, C.amber), sitStyle("Sem movimento", "FFF1F2F4", C.gray), sitStyle("DAS não informado", "FFEAF0F7", C.slate)] });
  const TT = VH + 13; wv.getCell(`B${TT}`).value = "Total do ano";
  for (const c of ["C", "D", "E", "F", "G", "H", "I", "J", "K", "Q", "R", "S"]) { wv.getCell(`${c}${TT}`).value = { formula: `SUM(${c}${VH + 1}:${c}${VH + 12})` }; wv.getCell(`${c}${TT}`).numFmt = moeda; }
  for (let c = 2; c <= 20; c++) { const cell = wv.getCell(TT, c); cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } }; cell.fill = fill(C.navy); }
  // partilha do ano
  const PT = TT + 3;
  wv.mergeCells(`B${PT}:J${PT}`); wv.getCell(`B${PT}`).value = "Partilha do DAS calculado"; wv.getCell(`B${PT}`).font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } };
  const ptc = [["B", "Mês"], ["C", "IRPJ", "AV"], ["D", "CSLL", "AW"], ["E", "COFINS", "AX"], ["F", "PIS", "AY"], ["G", "CPP", "AZ"], ["H", "ISS", "BB"], ["I", "ICMS", "BC"], ["J", "Total", "AO"]];
  ptc.forEach(([c, h]) => (wv.getCell(`${c}${PT + 1}`).value = h)); cabTabela(wv, PT + 1, C.slate);
  for (let m = 1; m <= 12; m++) {
    const n = PT + 1 + m; const key = `$C$5&"|"&${ANO * 100 + m}`;
    wv.getCell(`B${n}`).value = MESES[m - 1];
    for (const [c, , src] of ptc.slice(1)) { wv.getCell(`${c}${n}`).value = { formula: `IFERROR(INDEX(Fechamento!$${src}$${R0}:$${src}$${N},MATCH(${key},${FA},0)),"")` }; wv.getCell(`${c}${n}`).numFmt = moeda; }
    for (let c = 2; c <= 10; c++) { const cell = wv.getCell(n, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; if (m % 2 === 0) cell.fill = fill(C.bg); }
  }
  // folha (DP)
  wv.mergeCells(`L${PT}:R${PT}`); wv.getCell(`L${PT}`).value = "Folha — Departamento Pessoal"; wv.getCell(`L${PT}`).font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } };
  const fcols = [["L", "Mês"], ["M", "Folha bruta", "C"], ["N", "INSS", "D"], ["O", "FGTS", "E"], ["P", "Pró-labore", "F"], ["Q", "Autônomos", "G"], ["R", "Total", "H"]];
  fcols.forEach(([c, h]) => (wv.getCell(`${c}${PT + 1}`).value = h)); cabTabela(wv, PT + 1, C.slate);
  for (let i = 0; i < 24; i++) {
    const n = PT + 2 + i; const y = ANO - 1 + Math.floor(i / 12), m = (i % 12) + 1;
    wv.getCell(`L${n}`).value = dt(y, m); wv.getCell(`L${n}`).numFmt = mesFmt;
    for (const [c, , src] of fcols.slice(1)) { wv.getCell(`${c}${n}`).value = { formula: `SUMIFS(Folha!$${src}$2:$${src}$${NF},Folha!$A$2:$A$${NF},$C$5,Folha!$B$2:$B$${NF},$L${n})` }; wv.getCell(`${c}${n}`).numFmt = moeda; }
    for (let c = 12; c <= 18; c++) { const cell = wv.getCell(n, c); cell.font = { name: FONT, size: 9, color: { argb: C.ink } }; cell.border = { bottom: thin() }; if (i % 2 === 1) cell.fill = fill(C.bg); }
  }
  wv.getColumn("A").width = 2; wv.getColumn("B").width = 12; for (let c = 3; c <= 20; c++) wv.getColumn(c).width = 12.5; wv.getColumn("T").width = 16;
  wv.views = [{ showGridLines: false, zoomScale: 90 }];

  // ===== Como usar =====
  const wl = ABAS["Como usar"];
  banner(wl, "Como usar esta planilha", "SOMA Contabilidade Integrada", 3);
  wl.getColumn(1).width = 2; wl.getColumn(2).width = 4; wl.getColumn(3).width = 140;
  const itens = [
    ["Painel", "Escolha a competência em C5. Indicadores, gráficos e a lista de pendências mudam para o mês escolhido."],
    ["Fechamento", "Uma linha por empresa e mês. Filtre Competência para fechar o mês de todas, ou Código para ver o ano de uma. Células douradas são de digitação; o resto é fórmula. Clique no '+' acima das colunas para abrir o cálculo detalhado."],
    ["Empresa", "Escolha o código em C5 para ver o ano da empresa: receita, RBT12, Fator R, DAS, partilha e folha."],
    ["Receita", "Empresa sujeita ao Fator R entra em 'III/V Fator R'; as demais em 'Anexo III'. Retido = nota com ISS retido pelo tomador (o ISS sai do DAS)."],
    ["RBT12", "Soma os 12 meses anteriores (aba Histórico para 2025 e coluna 'Receita p/ RBT12' para 2026), usando a receita declarada no PGDAS-D quando houver. Com menos de 12 meses de atividade, proporcionaliza; no 1º mês, receita × 12."],
    ["Fator R", "Folha dos 12 meses anteriores (aba Folha) ÷ RBT12. ≥ 28% → Anexo III; abaixo → Anexo V. Sem receita nos 12 meses anteriores: 28% se houve folha, 1% se não houve (Res. CGSN 140, art. 26)."],
    ["ISS", "Limitado entre 2% e 5%; o excedente é redistribuído aos demais tributos na partilha."],
    ["Situação", "Bate (diferença até R$ 0,05) · Receita diferente (receita do sistema ≠ declarada) · Divergente (mesma receita, DAS diferente) · DAS não informado (mês declarado, mas o DAS ainda não foi lançado na planilha) · Falta declarar · Sem movimento."],
    ["Origem", `Atualizada em ${DATA_GERACAO} com as notas do sistema SOMA, a folha do sistema (importação do Resumo da folha) e as receitas/DAS declarados nos extratos do PGDAS-D já consultados no Integra Contador. Para atualizar: npm run fechamento:simples (pasta frontend) — o que foi digitado aqui é mantido.`],
    ["Limites", "ICMS dos Anexos I e II usa a alíquota cheia da tabela (sem a redução do ICMS-RJ)."],
  ];
  itens.forEach(([k, t], i) => { const r = 5 + i * 2; const a = wl.getCell(`C${r}`); a.value = k; a.font = { name: FONT, bold: true, size: 11, color: { argb: C.navy } }; const b = wl.getCell(`C${r + 1}`); b.value = t; b.font = { name: FONT, size: 10, color: { argb: C.ink } }; b.alignment = { wrapText: true, vertical: "top" }; wl.getRow(r + 1).height = 30; wl.getCell(`B${r}`).value = "■"; wl.getCell(`B${r}`).font = { color: { argb: C.gold } }; });

  // grava a base, guarda cópia da versão anterior e o Excel insere os gráficos
  const base = path.join(os.tmpdir(), `fechamento-simples-base-${Date.now()}.xlsx`);
  await wb.xlsx.writeFile(base);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  if (fs.existsSync(OUT)) {
    const bk = path.join(path.dirname(OUT), "versoes-anteriores"); fs.mkdirSync(bk, { recursive: true });
    const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    try { fs.copyFileSync(OUT, path.join(bk, `${path.basename(OUT, ".xlsx")} - ${carimbo}.xlsx`)); } catch (e) { throw new Error(`Não consegui copiar a planilha atual — ela está aberta no Excel? Feche e rode de novo. (${e.message})`); }
  }
  const ps = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(DIR, "graficos.ps1"), "-Entrada", base, "-Saida", OUT], { encoding: "utf8" });
  fs.rmSync(base, { force: true });
  if (ps.status !== 0 || !/ok/.test(ps.stdout)) throw new Error(`Falha ao montar os gráficos no Excel (a planilha está aberta?):
${ps.stdout}
${ps.stderr}`);
  const comDas = fech.filter((r) => r.declDas != null);
  const porMes = {}; for (const r of comDas) { const k = ym(r.y, r.m); porMes[k] ??= [0, 0]; porMes[k][1]++; if (Math.abs(r.das - r.declDas) <= 0.05) porMes[k][0]++; }
  console.log(`
Planilha atualizada: ${OUT}`);
  for (const [k, [b, t]] of Object.entries(porMes).sort()) console.log(`  ${k}: DAS calculado bate com o declarado em ${b} de ${t} empresas`);
  })();
}

main().catch((e) => { console.error("\nErro:", e.message); process.exit(1); });
