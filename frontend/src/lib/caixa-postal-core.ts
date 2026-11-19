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
