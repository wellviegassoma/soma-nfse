import crypto from "node:crypto";
import { NextResponse, after } from "next/server";
import { lerComando, receberComandoNota } from "@/lib/pedido-nota/receber";

// Webhook do Digisac (evento message.created). Chega para TODA mensagem da
// conta — milhares por dia —, então o filtro precisa ser barato e não tocar
// no banco: só um comentário interno começando com "#nota" segue adiante.
//
// O Digisac não assina o webhook. Proteções:
//  1. segredo na URL cadastrada (?token=DIGISAC_WEBHOOK_SECRET), comparado em
//     tempo constante, falha fechado se a variável não existir;
//  2. o payload só serve de gatilho: receberComandoNota busca a mensagem de
//     novo na API do Digisac com o nosso token e decide com base nela.
//
// Ver docs/pedido-nota-ia.md, Fase 1.

// Captura (Fase 1) + extração por IA (Fase 2) rodam no after() desta rota.
export const maxDuration = 300;

function segredoValido(request: Request): boolean {
  const esperado = process.env.DIGISAC_WEBHOOK_SECRET;
  const recebido = new URL(request.url).searchParams.get("token");
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type MensagemPayload = { id?: unknown; isComment?: unknown; text?: unknown };
// O formato exato do corpo não está na documentação (só os nomes dos
// eventos). Aceita { event, data: {...mensagem} } e também a mensagem solta
// no corpo — confirmar com o primeiro webhook real e registrar em
// docs/pedido-nota-ia.md.
type Payload = MensagemPayload & {
  event?: string;
  type?: string;
  data?: MensagemPayload | null;
};

export async function POST(request: Request) {
  if (!segredoValido(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ ok: true, ignorado: "corpo inválido" });
  }

  const msg = payload.data ?? payload;
  const evento = payload.event ?? "";
  if (
    (evento && evento !== "message.created") ||
    !msg ||
    typeof msg.id !== "string" ||
    msg.isComment !== true ||
    typeof msg.text !== "string" ||
    !lerComando(msg.text).ehComando
  ) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  const messageId = msg.id;
  after(async () => {
    try {
      const r = await receberComandoNota(messageId);
      console.log("[pedido-nota] comando processado:", r.motivo, r.pedidoId ?? "");
    } catch (e) {
      console.error("[pedido-nota] falha:", e instanceof Error ? e.message : e);
    }
  });

  return NextResponse.json({ ok: true, recebido: true });
}
