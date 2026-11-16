import "server-only";
import { put } from "@vercel/blob";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  baixarArquivo,
  buscarContato,
  buscarMensagem,
  enviarComentario,
  listarMensagensDoChamado,
  type DigisacMensagem,
} from "@/lib/digisac/client";

// Fase 1 do pedido de nota (docs/pedido-nota-ia.md): o atendente manda um
// comentário interno "#nota" no chamado do Digisac; aqui capturamos as
// mensagens do cliente daquele chamado + anexos e gravamos o pedido.
// A IA (Fase 2) e o painel de aprovação (Fase 3) partem do que fica gravado.

export const COMANDO_PADRAO = "#nota";

export function comandoNota(): string {
  return (process.env.DIGISAC_COMANDO_NOTA || COMANDO_PADRAO).trim().toLowerCase();
}

/** "#nota 3500 consultoria" → { ehComando: true, dica: "3500 consultoria" }. */
export function lerComando(texto: string | null | undefined): { ehComando: boolean; dica: string | null } {
  const t = (texto ?? "").trim();
  const cmd = comandoNota();
  if (!t.toLowerCase().startsWith(cmd)) return { ehComando: false, dica: null };
  const resto = t.slice(cmd.length);
  // "#notas" ou "#notafiscal" não contam — o comando precisa terminar ali.
  if (resto && !/^\s/.test(resto)) return { ehComando: false, dica: null };
  const dica = resto.trim();
  return { ehComando: true, dica: dica || null };
}

const TIPOS_CLIENTE = new Set(["chat", "image", "document", "audio", "ptt", "video"]);
const TIPOS_COM_ARQUIVO = new Set(["image", "document", "audio", "ptt", "video"]);
const MAX_ANEXOS = 15;
// Mensagens do cliente consideradas: as mais recentes antes do "#nota",
// no máximo nesta janela (um chamado longo pode ter pedidos antigos).
const JANELA_MS = 72 * 60 * 60 * 1000;
const MAX_MENSAGENS = 40;

type MensagemGravada = {
  id: string;
  timestamp: string;
  tipo: string;
  texto: string | null;
  anexo_index: number | null;
};

type AnexoGravado = {
  message_id: string;
  pathname: string;
  nome: string | null;
  mimetype: string | null;
  bytes: number;
};

function extensaoSegura(ext: string | null | undefined): string {
  const e = (ext ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  return e || "bin";
}

/**
 * Processa um comentário "#nota". Idempotente pelo id da mensagem do
 * comentário: reenvio do webhook não duplica o pedido.
 *
 * `messageId` vem do webhook (não assinado) — por isso a mensagem é buscada
 * de novo na API do Digisac com o nosso token, e só ela vale.
 */
export async function receberComandoNota(messageId: string): Promise<{ pedidoId: string | null; motivo: string }> {
  const comando = await buscarMensagem(messageId);
  // Id inexistente: o Digisac responde 200 com corpo null (visto em teste).
  if (!comando) return { pedidoId: null, motivo: "mensagem não encontrada no Digisac" };
  const { ehComando, dica } = lerComando(comando.text);
  if (!comando.isComment || !ehComando) return { pedidoId: null, motivo: "não é comentário #nota" };
  if (!comando.ticketId) return { pedidoId: null, motivo: "comentário sem chamado" };

  const admin = createAdminClient();

  // Reserva o pedido primeiro (unique por comando) — se já existe, para aqui.
  const { data: criado, error: erroCriar } = await admin
    .from("pedidos_nota")
    .insert({
      origem: "DIGISAC",
      origem_comando_message_id: comando.id,
      origem_ticket_id: comando.ticketId,
      origem_contact_id: comando.contactId,
      origem_service_id: comando.serviceId,
      origem_user_id: comando.userId,
      dica_atendente: dica,
      status: "RECEBIDO",
    })
    .select("id")
    .single();
  if (erroCriar) {
    if (erroCriar.code === "23505") return { pedidoId: null, motivo: "pedido já registrado" };
    throw new Error(`Falha ao gravar pedido_nota: ${erroCriar.message}`);
  }
  const pedidoId = criado.id as string;

  try {
    const [contato, mensagensChamado] = await Promise.all([
      buscarContato(comando.contactId),
      listarMensagensDoChamado(comando.ticketId),
    ]);

    const limiteTempo = Date.parse(comando.timestamp);
    const doCliente = mensagensChamado
      .filter(
        (m) =>
          !m.isFromMe &&
          !m.isComment &&
          TIPOS_CLIENTE.has(m.type) &&
          Date.parse(m.timestamp) <= limiteTempo &&
          limiteTempo - Date.parse(m.timestamp) <= JANELA_MS,
      )
      .slice(-MAX_MENSAGENS);

    const mensagens: MensagemGravada[] = [];
    const anexos: AnexoGravado[] = [];
    const falhasAnexo: string[] = [];

    for (const m of doCliente) {
      let anexoIndex: number | null = null;
      if (TIPOS_COM_ARQUIVO.has(m.type) && anexos.length < MAX_ANEXOS) {
        try {
          anexoIndex = anexos.length;
          anexos.push(await copiarAnexo(pedidoId, m));
        } catch (e) {
          anexoIndex = null;
          falhasAnexo.push(`${m.type}: ${e instanceof Error ? e.message : "falha"}`);
        }
      }
      mensagens.push({ id: m.id, timestamp: m.timestamp, tipo: m.type, texto: m.text || null, anexo_index: anexoIndex });
    }

    const telefone = contato.data?.number ?? null;
    let candidatas: string[] = [];
    if (telefone) {
      const { data } = await admin.rpc("pedido_nota_empresas_por_telefone", { p_telefone: telefone });
      candidatas = ((data ?? []) as unknown[]).map((v) =>
        typeof v === "string" ? v : String((v as Record<string, unknown>).pedido_nota_empresas_por_telefone),
      );
    }

    const semMensagem = mensagens.length === 0;
    await admin
      .from("pedidos_nota")
      .update({
        telefone,
        contato_nome: contato.name ?? contato.internalName ?? null,
        company_id: candidatas.length === 1 ? candidatas[0] : null,
        companies_candidatas: candidatas,
        mensagens,
        anexos,
        status: semMensagem ? "ERRO" : "RECEBIDO",
        erro: semMensagem
          ? "Nenhuma mensagem do cliente encontrada neste chamado (últimas 72h antes do #nota)."
          : falhasAnexo.length
            ? `Alguns anexos não foram copiados: ${falhasAnexo.join("; ")}`
            : null,
      })
      .eq("id", pedidoId);

    await avisarAtendente(comando.contactId, montarAviso({ semMensagem, candidatas: candidatas.length, mensagens, anexos }));
    return { pedidoId, motivo: semMensagem ? "sem mensagens do cliente" : "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao processar o pedido.";
    await admin.from("pedidos_nota").update({ status: "ERRO", erro: msg }).eq("id", pedidoId);
    await avisarAtendente(
      comando.contactId,
      "⚠️ SOMA Gestão: não consegui registrar o pedido de nota. Tente o #nota de novo em alguns minutos ou emita pelo sistema.",
    );
    throw e;
  }
}

async function copiarAnexo(pedidoId: string, m: DigisacMensagem): Promise<AnexoGravado> {
  const completa = m.file ? m : await buscarMensagem(m.id, { comArquivo: true });
  if (!completa?.file?.url) throw new Error("mensagem sem arquivo");
  const conteudo = await baixarArquivo(completa.file);
  const pathname = `pedidos-nota/${pedidoId}/${m.id}.${extensaoSegura(completa.file.extension)}`;
  await put(pathname, conteudo, {
    access: "private",
    addRandomSuffix: false,
    contentType: completa.file.mimetype ?? undefined,
  });
  return {
    message_id: m.id,
    pathname,
    nome: completa.file.name,
    mimetype: completa.file.mimetype,
    bytes: conteudo.byteLength,
  };
}

function montarAviso(p: {
  semMensagem: boolean;
  candidatas: number;
  mensagens: MensagemGravada[];
  anexos: AnexoGravado[];
}): string {
  if (p.semMensagem) {
    return "⚠️ SOMA Gestão: recebi o #nota, mas não achei mensagem do cliente neste chamado nas últimas 72h.";
  }
  const partes = [`${p.mensagens.length} mensagem(ns)`];
  if (p.anexos.length) partes.push(`${p.anexos.length} anexo(s)`);
  const empresa =
    p.candidatas === 1
      ? ""
      : p.candidatas === 0
        ? " Telefone sem empresa cadastrada: escolha a empresa no painel."
        : ` Telefone ligado a ${p.candidatas} empresas: escolha a empresa no painel.`;
  return `✅ SOMA Gestão: pedido de nota recebido (${partes.join(", ")}). O rascunho vai para aprovação.${empresa}`;
}

/** Comentário interno de retorno — desligável por env enquanto testa. */
async function avisarAtendente(contactId: string, texto: string) {
  if (process.env.DIGISAC_RESPONDER_COMENTARIOS !== "1") return;
  try {
    await enviarComentario(contactId, texto);
  } catch (e) {
    console.error("[pedido-nota] falha ao comentar no Digisac:", e instanceof Error ? e.message : e);
  }
}
