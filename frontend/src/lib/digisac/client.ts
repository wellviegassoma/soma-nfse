import "server-only";

// Cliente mínimo da API do Digisac (plataforma de atendimento por WhatsApp
// que a SOMA usa hoje). Documentação: Postman
// https://documenter.getpostman.com/view/53282970/2sBXihpXmF — formatos
// conferidos contra a conta real em 16/11/2026 (ver docs/pedido-nota-ia.md,
// Fase 0).
//
// Auth: Bearer com token pessoal (Conta → API → Tokens de acesso pessoal).
// O token herda as permissões do usuário que o criou — em produção, um
// usuário de integração dedicado.
//
// Cuidado: `file.url` de uma mensagem abre SEM autenticação. Nunca logar,
// nunca gravar no banco — baixar e copiar para o Blob privado.

export type DigisacArquivo = {
  id: string;
  name: string | null;
  extension: string | null;
  mimetype: string | null;
  url: string;
};

export type DigisacMensagem = {
  id: string;
  type: string; // chat, image, document, audio, ptt, ticket, reaction...
  text: string | null;
  timestamp: string;
  isFromMe: boolean;
  isComment: boolean;
  origin: string | null;
  contactId: string;
  ticketId: string | null;
  serviceId: string | null;
  userId: string | null;
  file?: DigisacArquivo | null;
};

export type DigisacContato = {
  id: string;
  name?: string | null;
  internalName?: string | null;
  isGroup?: boolean;
  data?: { number?: string | null } | null;
};

type Pagina<T> = { data: T[]; total: number; currentPage: number; lastPage: number };

const TIMEOUT_MS = 15_000;

function config() {
  const url = process.env.DIGISAC_URL;
  const token = process.env.DIGISAC_TOKEN;
  if (!url || !token) throw new Error("DIGISAC_URL/DIGISAC_TOKEN não configurados.");
  return { base: `${new URL(url).origin}/api/v1`, token };
}

async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
  const { base, token } = config();
  const resp = await fetch(base + caminho, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!resp.ok) {
    // Corpo do erro pode trazer dado de cliente — só o status e o caminho
    // sem query (a query pode ter telefone).
    throw new Error(`Digisac ${metodo} ${caminho.split("?")[0]} → HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

/** null quando o id não existe (o Digisac responde 200 com corpo null). */
export async function buscarMensagem(id: string, opcoes?: { comArquivo?: boolean }): Promise<DigisacMensagem | null> {
  const q = opcoes?.comArquivo ? "?include[0]=file" : "";
  return chamar<DigisacMensagem | null>("GET", `/messages/${encodeURIComponent(id)}${q}`);
}

/** Todas as mensagens de um chamado (paginado), em ordem cronológica. */
export async function listarMensagensDoChamado(ticketId: string, limite = 300): Promise<DigisacMensagem[]> {
  const todas: DigisacMensagem[] = [];
  for (let pagina = 1; todas.length < limite; pagina++) {
    const r = await chamar<Pagina<DigisacMensagem>>(
      "GET",
      `/messages?where[ticketId]=${encodeURIComponent(ticketId)}&perPage=100&page=${pagina}`,
    );
    todas.push(...(r.data ?? []));
    if (!r.data?.length || pagina >= (r.lastPage ?? 1)) break;
  }
  // Não confiar na ordem da API: ordena pelo timestamp.
  return todas
    .filter((m) => m.ticketId === ticketId)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(0, limite);
}

export async function buscarContato(id: string): Promise<DigisacContato> {
  return chamar<DigisacContato>("GET", `/contacts/${encodeURIComponent(id)}`);
}

let usuarioIntegracaoId: string | null = null;
/** Id do usuário dono do token (autor das mensagens que o SOMA Gestão envia). */
export async function idUsuarioIntegracao(): Promise<string> {
  if (!usuarioIntegracaoId) {
    const me = await chamar<{ id: string }>("GET", "/me");
    usuarioIntegracaoId = me.id;
  }
  return usuarioIntegracaoId;
}

/** Comentário interno no chamado do contato (o cliente não vê). */
export async function enviarComentario(contactId: string, texto: string): Promise<void> {
  await chamar("POST", "/messages", {
    type: "comment",
    text: texto,
    contactId,
    userId: await idUsuarioIntegracao(),
    origin: "bot",
  });
}

/** Mensagem com arquivo para o cliente (vai para o WhatsApp dele). */
export async function enviarArquivo(p: {
  contactId: string;
  serviceId: string | null;
  texto: string;
  arquivo: { base64: string; mimetype: string; nome: string };
}): Promise<void> {
  await chamar("POST", "/messages", {
    contactId: p.contactId,
    ...(p.serviceId ? { serviceId: p.serviceId } : {}),
    userId: await idUsuarioIntegracao(),
    origin: "bot",
    text: p.texto,
    file: { base64: p.arquivo.base64, mimetype: p.arquivo.mimetype, name: p.arquivo.nome },
  });
}

const TAMANHO_MAX_ARQUIVO = 20 * 1024 * 1024;

/**
 * Baixa o binário de um arquivo de mensagem. Só aceita URL https do próprio
 * Digisac ou do armazenamento que ele usa — não segue URL arbitrária vinda
 * de payload (o webhook não é assinado).
 */
export async function baixarArquivo(arquivo: DigisacArquivo): Promise<Buffer> {
  const url = new URL(arquivo.url);
  if (url.protocol !== "https:") throw new Error("URL de arquivo do Digisac não é https.");
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000), cache: "no-store" });
  if (!resp.ok) throw new Error(`Download de arquivo do Digisac → HTTP ${resp.status}`);
  const tamanho = Number(resp.headers.get("content-length") ?? "0");
  if (tamanho > TAMANHO_MAX_ARQUIVO) throw new Error("Arquivo maior que 20 MB.");
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.byteLength > TAMANHO_MAX_ARQUIVO) throw new Error("Arquivo maior que 20 MB.");
  return buf;
}
