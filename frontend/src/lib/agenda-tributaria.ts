// Agenda Tributária da Receita Federal — importação da agenda oficial.
//
// Todo mês a RFB publica um ADE Corat com a agenda do mês seguinte (por volta
// do dia 23–28) e anexa uma planilha .xlsx na página do mês:
//   https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria/AAAA/<Mês>
// Abas "Tributos" (~300 linhas) e "Declarações" (~10). Em jan–nov/2026 o
// formato foi o mesmo em todos os meses, exceto julho, que só teve o PDF do
// ADE — nesse caso as páginas de cada dia (dia-DD-MM-AAAA, diario,
// outros-vencimentos) trazem as mesmas linhas em tabela HTML, e servem de
// reserva. Os vencimentos vêm prontos (com feriado e dia útil já aplicados
// pela Receita, que trata cada tributo de um jeito: em nov/2026 os federais
// do dia 20 foram antecipados para 19 e o Simples adiado para 23) — por
// isso o sistema importa a agenda em vez de calcular regras.

export const AGENDA_BASE_URL = "https://www.gov.br/receitafederal/pt-br/assuntos/agenda-tributaria";

const NOMES_MES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type AgendaItem = {
  tipo: "TRIBUTO" | "DECLARACAO";
  ordem: number;
  dia: number | null; // 0 = diário; null = prazo em texto
  dia_texto: string | null;
  vencimento: string | null; // YYYY-MM-DD
  codigo: string | null;
  grupo: string | null;
  descricao: string;
  periodo: string | null;
  periodicidade: string | null;
  documento: string | null;
  declaracao: string | null;
  origem_escrituracao: string | null;
  fundamentacao: string | null;
};

export type AgendaImportada = {
  mes: string; // YYYY-MM
  ade: string | null;
  fonteUrl: string;
  origem: "XLSX" | "HTML" | "UPLOAD";
  itens: AgendaItem[];
};

// ---------------------------------------------------------------- utilidades

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function limpar(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" || s === "--" || s === "-" ? null : s;
}

function decodificarHtml(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&ordm;/g, "º").replace(/&ordf;/g, "ª").replace(/&sect;/g, "§")
    .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function codigoReceita(v: unknown): string | null {
  const s = limpar(v);
  if (!s) return null;
  // A planilha traz o código como número (561); o DARF usa 4 dígitos (0561).
  return /^\d{1,3}$/.test(s) ? s.padStart(4, "0") : s;
}

function diasNoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function resolverDia(v: unknown, mes: string): Pick<AgendaItem, "dia" | "dia_texto" | "vencimento"> {
  const s = limpar(v);
  if (s && /^\d{1,2}$/.test(s)) {
    const dia = Number(s);
    if (dia === 0) return { dia: 0, dia_texto: "Diário", vencimento: null };
    if (dia <= diasNoMes(mes)) {
      return { dia, dia_texto: null, vencimento: `${mes}-${String(dia).padStart(2, "0")}` };
    }
  }
  return { dia: null, dia_texto: s, vencimento: null };
}

function adeDoNomeArquivo(url: string): string | null {
  // anexo-ade-corat-no-85-de-27-10-26.xlsx → ADE Corat nº 85 de 27/10/26
  const m = /ade-corat-n[oº]?-(\d+)-de-(\d{1,2})-(\d{1,2})-(\d{2,4})/i.exec(decodeURIComponent(url));
  return m ? `ADE Corat nº ${m[1]} de ${m[2].padStart(2, "0")}/${m[3].padStart(2, "0")}/${m[4]}` : null;
}

// ------------------------------------------------------------ planilha .xlsx

type Linha = unknown[];

function acharCabecalho(linhas: Linha[], primeiraColuna: string): { idx: number; colunas: string[] } | null {
  for (let i = 0; i < Math.min(linhas.length, 15); i++) {
    const cols = linhas[i].map((c) => semAcento(String(c ?? "")));
    if (cols.some((c) => c.startsWith(primeiraColuna))) return { idx: i, colunas: cols };
  }
  return null;
}

function col(colunas: string[], ...prefixos: string[]): number {
  return colunas.findIndex((c) => prefixos.some((p) => c.startsWith(p)));
}

/** Lê a planilha anexa ao ADE Corat (abas Tributos e Declarações). */
export async function lerPlanilhaAgenda(buffer: ArrayBuffer | Buffer, mes: string): Promise<AgendaItem[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? "buffer" : "array" });
  const itens: AgendaItem[] = [];
  let ordem = 0;

  for (const nome of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<Linha>(wb.Sheets[nome], { header: 1, defval: null, raw: true });

    const trib = acharCabecalho(linhas, "dia de vencimento");
    if (trib) {
      const c = trib.colunas;
      const iDia = col(c, "dia de vencimento");
      const iCod = col(c, "codigo de receita");
      const iGrupo = col(c, "grupo de tributo");
      const iDesc = col(c, "descricao");
      const iPer = col(c, "periodo de apuracao");
      const iPeriod = col(c, "periodicidade");
      const iDoc = col(c, "documento");
      const iDecl = col(c, "categoria da declaracao");
      const iOrig = col(c, "origem");
      const iFund = col(c, "fundamentacao");
      if ([iDia, iCod, iGrupo, iDesc, iPer].some((i) => i < 0)) {
        throw new Error(`Aba "${nome}": colunas da planilha mudaram (${c.join(" | ")}).`);
      }
      for (const l of linhas.slice(trib.idx + 1)) {
        const descricao = limpar(l[iDesc]);
        if (!descricao || l[iDia] == null) continue;
        itens.push({
          tipo: "TRIBUTO",
          ordem: ordem++,
          ...resolverDia(l[iDia], mes),
          codigo: codigoReceita(l[iCod]),
          grupo: limpar(l[iGrupo]),
          descricao,
          periodo: limpar(l[iPer]),
          periodicidade: iPeriod >= 0 ? limpar(l[iPeriod]) : null,
          documento: iDoc >= 0 ? limpar(l[iDoc]) : null,
          declaracao: iDecl >= 0 ? limpar(l[iDecl]) : null,
          origem_escrituracao: iOrig >= 0 ? limpar(l[iOrig]) : null,
          fundamentacao: iFund >= 0 ? limpar(l[iFund]) : null,
        });
      }
      continue;
    }

    const decl = acharCabecalho(linhas, "prazo de apresentacao");
    if (decl) {
      const c = decl.colunas;
      const iDia = col(c, "prazo de apresentacao");
      const iInt = col(c, "interessado");
      const iDecl = col(c, "declarac");
      const iPer = col(c, "periodo de referencia");
      const iBase = col(c, "base normativa");
      if ([iDia, iDecl].some((i) => i < 0)) {
        throw new Error(`Aba "${nome}": colunas da planilha mudaram (${c.join(" | ")}).`);
      }
      for (const l of linhas.slice(decl.idx + 1)) {
        const descricao = limpar(l[iDecl]);
        if (!descricao || l[iDia] == null) continue;
        itens.push({
          tipo: "DECLARACAO",
          ordem: ordem++,
          ...resolverDia(l[iDia], mes),
          codigo: null,
          grupo: iInt >= 0 ? limpar(l[iInt]) : null,
          descricao,
          periodo: iPer >= 0 ? limpar(l[iPer]) : null,
          periodicidade: null,
          documento: null,
          declaracao: null,
          origem_escrituracao: null,
          fundamentacao: iBase >= 0 ? limpar(l[iBase]) : null,
        });
      }
    }
  }

  if (!itens.some((i) => i.tipo === "TRIBUTO")) {
    throw new Error("A planilha não tem a aba de Tributos no formato da agenda da Receita.");
  }
  return itens;
}

// ------------------------------------------------ páginas diárias (reserva)

function conteudoPrincipal(html: string): string {
  const i = html.indexOf('id="content-core"');
  if (i < 0) return "";
  const j = html.indexOf("Compartilhe:", i);
  return html.slice(i, j > 0 ? j : undefined);
}

function celulas(tabela: string): string[] {
  return [...tabela.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
    decodificarHtml(m[1].replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
  );
}

/**
 * Lê as tabelas de uma página diária da agenda. `dia` é o dia da página
 * (0 para "diário", null para "outros vencimentos", que traz o prazo na
 * primeira coluna).
 */
export function lerPaginaDia(html: string, mes: string, dia: number | null, ordemInicial: number): AgendaItem[] {
  const itens: AgendaItem[] = [];
  let ordem = ordemInicial;
  const tabelas = conteudoPrincipal(html).match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const t of tabelas) {
    const cs = celulas(t);
    if (cs.length === 0) continue;
    const primeira = semAcento(cs[0]);
    let largura: number;
    let tipo: "TRIBUTO" | "DECLARACAO";
    let comDia = false;
    if (primeira.startsWith("dia de vencimento")) { largura = 8; tipo = "TRIBUTO"; comDia = true; }
    else if (primeira.startsWith("codigo de receita")) { largura = 7; tipo = "TRIBUTO"; }
    else if (primeira.startsWith("prazo")) { largura = 5; tipo = "DECLARACAO"; comDia = true; }
    else if (primeira.startsWith("interessado")) { largura = 4; tipo = "DECLARACAO"; }
    else continue;

    const dados = cs.slice(largura);
    if (dados.length % largura !== 0) {
      throw new Error(`Tabela da página do dia ${dia ?? "outros"} com ${dados.length} células — formato mudou.`);
    }
    for (let k = 0; k < dados.length; k += largura) {
      const r = dados.slice(k, k + largura);
      const quando = comDia ? resolverDia(r.shift(), mes) : resolverDia(dia, mes);
      if (tipo === "TRIBUTO") {
        const [cod, grupo, desc, per, doc, declOrig, fund] = r;
        const [decl, orig] = (declOrig ?? "").split(" / ");
        if (!limpar(desc)) continue;
        itens.push({
          tipo, ordem: ordem++, ...quando,
          codigo: codigoReceita(cod), grupo: limpar(grupo), descricao: limpar(desc)!,
          periodo: limpar(per), periodicidade: null, documento: limpar(doc),
          declaracao: limpar(decl), origem_escrituracao: limpar(orig), fundamentacao: limpar(fund),
        });
      } else {
        const [interessado, desc, per, base] = r;
        if (!limpar(desc)) continue;
        itens.push({
          tipo, ordem: ordem++, ...quando,
          codigo: null, grupo: limpar(interessado), descricao: limpar(desc)!,
          periodo: limpar(per), periodicidade: null, documento: null,
          declaracao: null, origem_escrituracao: null, fundamentacao: limpar(base),
        });
      }
    }
  }
  return itens;
}

// ------------------------------------------------------------ busca no gov.br

async function baixar(url: string): Promise<Response> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; agenda-tributaria)" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  return r;
}

/** URL da página do mês (a caixa do nome varia: "janeiro", "Novembro"). Null se não publicada. */
async function urlPaginaMes(mes: string): Promise<string | null> {
  const [ano, m] = mes.split("-").map(Number);
  const nome = NOMES_MES[m - 1];
  const candidatos: string[] = [];

  const idx = await baixar(`${AGENDA_BASE_URL}/${ano}`);
  if (idx.ok) {
    const html = await idx.text();
    const re = new RegExp(`href="(${AGENDA_BASE_URL.replace(/[.]/g, "\\.")}/${ano}/([^"/]+))/?"`, "gi");
    for (const x of html.matchAll(re)) {
      const seg = semAcento(decodeURIComponent(x[2])).replace("ç", "c");
      if (seg === nome || seg === nome.replace("marco", "março")) candidatos.push(x[1]);
    }
  }
  candidatos.push(
    `${AGENDA_BASE_URL}/${ano}/${nome[0].toUpperCase()}${nome.slice(1)}`,
    `${AGENDA_BASE_URL}/${ano}/${nome}`,
  );

  for (const url of [...new Set(candidatos)]) {
    const r = await baixar(url);
    // Mês ainda em rascunho: o Plone redireciona para o login.
    if (r.ok && !r.url.includes("require_login") && !r.url.includes("acl_users")) return r.url;
  }
  return null;
}

/**
 * Busca a agenda oficial de `mes` (YYYY-MM) no site da Receita. Retorna null
 * se a Receita ainda não publicou o mês.
 */
export async function buscarAgendaOficial(mes: string): Promise<AgendaImportada | null> {
  const pagina = await urlPaginaMes(mes);
  if (!pagina) return null;
  const html = await (await baixar(pagina)).text();

  // 1) Planilha anexa ao ADE.
  const xlsx = [...html.matchAll(/href="([^"]+\.xlsx)"/gi)].map((x) => x[1])
    .find((u) => u.toLowerCase().includes("agenda-tributaria"));
  if (xlsx) {
    const r = await baixar(xlsx);
    if (!r.ok) throw new Error(`Planilha da agenda respondeu HTTP ${r.status}.`);
    const itens = await lerPlanilhaAgenda(await r.arrayBuffer(), mes);
    return { mes, ade: adeDoNomeArquivo(xlsx), fonteUrl: xlsx, origem: "XLSX", itens };
  }

  // 2) Reserva: páginas de cada dia.
  const base = pagina.replace(/\/$/, "");
  const links = [...new Set([...html.matchAll(/href="([^"]+)"/gi)].map((x) => x[1].replace(/\/$/, "")))]
    .filter((u) => u.startsWith(base + "/"));
  const paginas = new Map<string, { url: string; dia: number | null }>();
  for (const u of links) {
    const seg = semAcento(decodeURIComponent(u.slice(base.length + 1)));
    let chave: string;
    let dia: number | null;
    const m = /(\d{1,2})-\d{1,2}-\d{4}$/.exec(seg) ?? /^(\d{1,2})$/.exec(seg);
    if (seg === "diario") { chave = "0"; dia = 0; }
    else if (seg.startsWith("outros-vencimentos")) { chave = "outros"; dia = null; }
    else if (m) { dia = Number(m[1]); chave = String(dia); }
    else continue;
    // /10 e /dia-10-11-2026 são o mesmo dia: fica a página com data no nome.
    if (!paginas.has(chave) || /\d{4}$/.test(seg)) paginas.set(chave, { url: u, dia });
  }
  if (paginas.size === 0) {
    throw new Error("A página do mês não tem planilha nem páginas por dia — formato mudou.");
  }

  const ordenadas = [...paginas.values()].sort((a, b) => (a.dia ?? 99) - (b.dia ?? 99));
  const itens: AgendaItem[] = [];
  for (const p of ordenadas) {
    const r = await baixar(p.url);
    if (!r.ok) throw new Error(`Página ${p.url} respondeu HTTP ${r.status}.`);
    itens.push(...lerPaginaDia(await r.text(), mes, p.dia, itens.length));
  }
  if (!itens.some((i) => i.tipo === "TRIBUTO")) {
    throw new Error("Nenhum tributo encontrado nas páginas diárias — formato mudou.");
  }
  const adePdf = [...html.matchAll(/href="([^"]+\.pdf)"/gi)].map((x) => x[1]).find((u) => /corat/i.test(u));
  const ade = adePdf
    ? (/corat-n[oº]?-(\d+)/i.exec(adePdf)?.[1] ? `ADE Corat nº ${/corat-n[oº]?-(\d+)/i.exec(adePdf)![1]}` : null)
    : null;
  return { mes, ade, fonteUrl: pagina, origem: "HTML", itens };
}

// ------------------------------------------------------------ gravação

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export async function gravarAgenda(supabase: RpcClient, agenda: AgendaImportada): Promise<number> {
  const { data, error } = await supabase.rpc("agenda_tributaria_substituir_mes", {
    p_mes: `${agenda.mes}-01`,
    p_ade: agenda.ade,
    p_fonte_url: agenda.fonteUrl,
    p_origem: agenda.origem,
    p_itens: agenda.itens,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

// ------------------------------------------------------- relevância SOMA

// Códigos que a carteira da SOMA (PJ/PF da saúde: Simples, Presumido,
// Carnê-Leão, folha) recolhe. O resto da agenda (IOF, CPSS, Cide, IPI,
// parcelamentos especiais...) aparece em "Todas".
const CODIGOS_RELEVANTES = new Set([
  "0561", "0588", "1708", "3208", "5952", "0190", "0211", "4600", "8045",
  "1082", "1099", "1138", "1007", "1120", "1163", "1406", "1910",
  "2985", "2991", "8109", "2172", "2089", "2372",
]);
const GRUPOS_RELEVANTES = ["simples nacional", "simples domestico", "simei"];
const DECLARACOES_RELEVANTES = [
  "pgdas", "dctfweb", "efd-reinf", "efd-contribuicoes", "dasn-simei", "defis", "dirpf",
  "dmed", "ecd", "ecf", "dme", "opcao pelo regime especial unificado", "declaracao inicial",
];

export function itemRelevante(i: Pick<AgendaItem, "tipo" | "codigo" | "grupo" | "descricao">): boolean {
  if (i.tipo === "DECLARACAO") {
    const d = semAcento(i.descricao);
    return DECLARACOES_RELEVANTES.some((p) => d.startsWith(p));
  }
  if (i.codigo && CODIGOS_RELEVANTES.has(i.codigo)) return true;
  const g = semAcento(i.grupo ?? "");
  return GRUPOS_RELEVANTES.some((p) => g.startsWith(p));
}

// ------------------------------------------------------------ metas SOMA

/**
 * Identifica a obrigação em qualquer mês (a meta é da obrigação, não do
 * mês). Tributo com código: o código; sem código (Simples Nacional,
 * declarações): a descrição normalizada.
 */
export function chaveObrigacao(i: Pick<AgendaItem, "tipo" | "codigo" | "descricao">): string {
  if (i.tipo === "TRIBUTO" && i.codigo) return `TRIBUTO:${i.codigo}`;
  return `${i.tipo}:${semAcento(i.descricao).replace(/\s+/g, " ")}`;
}

/**
 * Data da meta SOMA (YYYY-MM-DD) no mês do vencimento: o dia cadastrado;
 * sábado/domingo antecipa para sexta (sem sair do mês — aí vai para a
 * segunda); nunca depois do prazo da Receita. Null se a obrigação não tem
 * vencimento em dia fixo (diária, prazo em texto).
 */
export function dataMeta(vencimento: string | null, diaMeta: number): string | null {
  if (!vencimento) return null;
  const [a, m] = vencimento.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const d = new Date(Date.UTC(a, m - 1, Math.min(diaMeta, ultimo)));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  if (d.getUTCMonth() !== m - 1) {
    d.setUTCDate(d.getUTCDate() + 3); // saiu do mês (sexta anterior) → segunda seguinte
  }
  const iso = d.toISOString().slice(0, 10);
  return iso > vencimento ? vencimento : iso;
}
