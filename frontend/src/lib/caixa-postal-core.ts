// Caixa Postal do e-CAC lida pelo Integra Contador — CAIXAPOSTAL.MSGCONTRIBUINTE61
// (lista de mensagens). Sem dependência de servidor (testável).
//
// O QUE DÁ CIÊNCIA (documentação da Serpro, conferida em 19/11/2026):
// - MSGCONTRIBUINTE61 (lista: assunto, datas, relevância, leitura, ciência) — NÃO dá.
// - INNOVAMSG63 (indicador de mensagem nova) — NÃO dá.
// - MSGDETALHAMENTO62 (corpo da mensagem) — DÁ: "Assim como na aplicação Caixa
//   Postal do portal e-CAC, a execução deste serviço caracteriza ciência da
//   intimação" (art. 23, § 2º, III, do Decreto 70.235/1972). Por isso este
//   módulo nunca chama o 62 — o conteúdo é lido no e-CAC, por quem for tratar.
//
// Formato visto no exemplo oficial: `dados` é string JSON com
// { codigo, conteudo: [{ quantidadeMensagens, indicadorUltimaPagina, ...,
// listaMensagens: [...] }] }. Datas AAAAMMDD e horas HHMMSS como texto,
// vazias quando não se aplicam. Lido de forma tolerante.

export const SERVICO_LISTA = { idSistema: "CAIXAPOSTAL", idServico: "MSGCONTRIBUINTE61" } as const;

export type MensagemCaixaPostal = {
  isn: string;
  numeroControle: string | null;
  assunto: string;
  relevante: boolean;
  sistemaRemetente: number | null;
  codigoModelo: number | null;
  tipoOrigem: number | null;
  descricaoOrigem: string | null;
  enviadaEm: string | null; // ISO com fuso de Brasília
  lidaEm: string | null;
  cienciaEm: string | null; // YYYY-MM-DD
  validadeEm: string | null; // YYYY-MM-DD
  excluidaEm: string | null;
  bruto: Record<string, unknown>;
};

type Bruto = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function inteiro(v: unknown): number | null {
  const s = texto(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "20250408" → "2025-04-08". Zeros ("00000000") contam como vazio. */
export function dataSerpro(v: unknown): string | null {
  const s = texto(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})(\d{2})(\d{2})$/) ?? s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || m[1] === "0000") return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Data + hora (HHMMSS) da Serpro → ISO no fuso de Brasília. */
export function dataHoraSerpro(data: unknown, hora: unknown): string | null {
  const d = dataSerpro(data);
  if (!d) return null;
  const h = (texto(hora) ?? "").padStart(6, "0").match(/^(\d{2})(\d{2})(\d{2})$/);
  return `${d}T${h ? `${h[1]}:${h[2]}:${h[3]}` : "00:00:00"}-03:00`;
}

/** Assunto do modelo com o "++VARIAVEL++" trocado pelo parâmetro. */
export function montarAssunto(modelo: unknown, parametro: unknown): string {
  const m = texto(modelo) ?? "(sem assunto)";
  const p = texto(parametro);
  return m.includes("++VARIAVEL++") ? m.replace(/\+\+VARIAVEL\+\+/g, p ?? "").replace(/\s{2,}/g, " ").trim() : m;
}

function parseJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

/** Acha `listaMensagens` em qualquer nível (conteudo pode vir como array ou objeto). */
function acharLista(v: unknown, profundidade = 0): Bruto[] {
  if (profundidade > 5 || v == null) return [];
  if (typeof v === "string") return acharLista(parseJson(v), profundidade + 1);
  if (Array.isArray(v)) return v.flatMap((x) => acharLista(x, profundidade + 1));
  if (typeof v === "object") {
    const o = v as Bruto;
    if (Array.isArray(o.listaMensagens)) return o.listaMensagens.filter((x): x is Bruto => !!x && typeof x === "object");
    return Object.values(o).flatMap((x) => acharLista(x, profundidade + 1));
  }
  return [];
}

/** `resposta.dados` do MSGCONTRIBUINTE61 → mensagens. */
export function lerMensagens(dados: unknown): MensagemCaixaPostal[] {
  const vistos = new Set<string>();
  const saida: MensagemCaixaPostal[] = [];
  for (const x of acharLista(dados)) {
    const isn = texto(x.isn);
    if (!isn || vistos.has(isn)) continue;
    vistos.add(isn);
    saida.push({
      isn,
      numeroControle: texto(x.numeroControle),
      assunto: montarAssunto(x.assuntoModelo, x.valorParametroAssunto),
      relevante: texto(x.relevancia) === "2",
      sistemaRemetente: inteiro(x.codigoSistemaRemetente),
      codigoModelo: inteiro(x.codigoModelo),
      tipoOrigem: inteiro(x.tipoOrigem),
      descricaoOrigem: texto(x.descricaoOrigem),
      enviadaEm: dataHoraSerpro(x.dataEnvio, x.horaEnvio),
      lidaEm: dataHoraSerpro(x.dataLeitura, x.horaLeitura),
      cienciaEm: dataSerpro(x.dataCiencia),
      validadeEm: dataSerpro(x.dataValidade ?? x.dataExpiracao),
      excluidaEm: dataHoraSerpro(x.dataExclusao, x.horaExclusao),
      bruto: x,
    });
  }
  return saida;
}

/**
 * Assunto com cara de intimação/termo/cobrança/exclusão — destaque máximo na
 * tela, mesmo que a Receita não marque como relevante.
 */
const PADRAO_INTIMACAO =
  /intima|notifica|termo d|auto de infra|lan[çc]amento|exclus|inapt|suspens|baixa de of|cobran|d[ée]bito|pend[êe]ncia|malha|despacho decis|aviso de|regulariza|omiss/i;

export function ehIntimacao(assunto: string): boolean {
  return PADRAO_INTIMACAO.test(assunto);
}

export const ORIGEM: Record<number, string> = { 1: "Receita Federal", 2: "Estado", 3: "Município" };

export type StatusTratamento = "nova" | "em_tratamento" | "resolvida";
export const STATUS_LABEL: Record<StatusTratamento, string> = {
  nova: "Nova",
  em_tratamento: "Em tratamento",
  resolvida: "Resolvida",
};

/**
 * Na primeira leitura de uma empresa vem o histórico (até 50 mensagens, desde
 * o "Bem-vindo ao Caixa Postal!"). O que tem mais de 90 dias entra como
 * resolvido — menos intimação que ninguém abriu, que vai para a fila. Tudo dos
 * últimos 90 dias vai para a fila, inclusive o já lido (o caso que motivou a
 * central: lida e ninguém tratou). Depois da primeira leitura, tudo entra novo.
 */
export const DIAS_HISTORICO = 90;

export function statusInicial(m: MensagemCaixaPostal, primeiraLeituraDaEmpresa: boolean, agora = new Date()): StatusTratamento {
  if (!primeiraLeituraDaEmpresa || !m.enviadaEm) return "nova";
  const dias = (agora.getTime() - new Date(m.enviadaEm).getTime()) / 86_400_000;
  if (dias <= DIAS_HISTORICO) return "nova";
  return ehIntimacao(m.assunto) && !m.lidaEm ? "nova" : "resolvida";
}

// ---------------------------------------------------------------------------
// Conteúdo (MSGDETALHAMENTO62) — DÁ CIÊNCIA. Só chamado quando alguém
// confirma na tela; ver lib/actions/caixa-postal.ts (abrirConteudo).
// Saída: dados.conteudo[] com corpoModelo (texto do modelo, pode ter HTML
// e "++VARIAVEL++") e variaveis[] (valores, na ordem dos marcadores).
// ---------------------------------------------------------------------------

export const SERVICO_DETALHE = { idSistema: "CAIXAPOSTAL", idServico: "MSGDETALHAMENTO62" } as const;

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordf: "ª", ordm: "º", deg: "°", sect: "§",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", euro: "€", copy: "©", reg: "®", szlig: "ß",
};
// &aacute; &Ccedil; &otilde; … → letra + acento combinado, normalizado.
const ACENTO: Record<string, string> = {
  acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", uml: "\u0308", cedil: "\u0327", ring: "\u030a",
};

/** Entidades HTML (nomeadas e numéricas) → caracteres. A Receita manda acentos assim. */
export function decodificarEntidades(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (e, nome: string) => {
      const m = nome.match(/^([a-z])(acute|grave|circ|tilde|uml|cedil|ring)$/i);
      if (m) return (m[1] + ACENTO[m[2].toLowerCase()]).normalize("NFC");
      return ENTIDADES[nome] ?? ENTIDADES[nome.toLowerCase()] ?? e;
    });
}

/** HTML do modelo → texto simples (quebras preservadas; links viram "texto (url)"). */
export function htmlParaTexto(html: string): string {
  return html
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url: string, txt: string) =>
      txt.replace(/<[^>]+>/g, "").trim() === url ? url : `${txt} (${url})`,
    )
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Troca cada "++VARIAVEL++" pelo valor correspondente, na ordem. */
export function montarCorpo(modelo: string, variaveis: unknown[]): string {
  let i = 0;
  return modelo.replace(/\+\+VARIAVEL\+\+/g, () => {
    const v = variaveis[i++];
    return v == null ? "" : String(v);
  });
}

/** `resposta.dados` do MSGDETALHAMENTO62 → texto do corpo (ou null se não veio). */
export function lerCorpo(dados: unknown): string | null {
  const d = parseJson(dados) as Bruto | null;
  if (!d || typeof d !== "object") return null;
  const conteudo = d.conteudo;
  const msg = (Array.isArray(conteudo) ? conteudo[0] : conteudo) as Bruto | undefined;
  if (!msg || typeof msg !== "object") return null;
  const modelo = texto(msg.corpoModelo);
  if (!modelo) return null;
  const vars = Array.isArray(msg.variaveis) ? msg.variaveis : [];
  return decodificarEntidades(htmlParaTexto(montarCorpo(modelo, vars)))
    .split("\n")
    .map((l) => l.replace(/\u00a0/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
