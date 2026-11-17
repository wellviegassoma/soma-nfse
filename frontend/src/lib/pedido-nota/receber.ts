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
import { resolverEmpresa } from "@/lib/pedido-nota/empresa";
import { escolherEmpresaDoGrupo } from "@/lib/pedido-nota/escolher-empresa";
import { extrairPedido } from "@/lib/pedido-nota/extrair";

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
    // Um chamado pode ter vários pedidos: mensagens antes do "#nota" anterior
    // já foram atendidas por ele (visto no teste real — o 3º #nota do mesmo
    // chamado gerou rascunhos repetidos dos pedidos anteriores).
    const anterior = mensagensChamado
      .filter((m) => m.id !== comando.id && m.isComment && lerComando(m.text).ehComando && Date.parse(m.timestamp) < limiteTempo)
      .at(-1);
    const inicio = Math.max(limiteTempo - JANELA_MS, anterior ? Date.parse(anterior.timestamp) : -Infinity);
    const doCliente = mensagensChamado
      .filter(
        (m) =>
          !m.isFromMe &&
          !m.isComment &&
          TIPOS_CLIENTE.has(m.type) &&
          Date.parse(m.timestamp) <= limiteTempo &&
          Date.parse(m.timestamp) > inicio,
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

    // Grupo de WhatsApp: data.number é o id do grupo, não um telefone.
    const ehGrupo = Boolean(contato.isGroup);
    const telefone = ehGrupo ? null : (contato.data?.number ?? null);
    const nomeContato = [contato.internalName, contato.name].filter(Boolean).join(" ");
    const empresa = await resolverEmpresa(admin, { contactId: comando.contactId, nomeContato, telefone, dica, pedidoId });
    const candidatas = empresa.candidatas;

    const semMensagem = mensagens.length === 0;

    // Grupo cadastrado em várias empresas: a IA escolhe pela conversa.
    let escolhaIa: string | null = null;
    if (empresa.grupoComVarias && !semMensagem) {
      try {
        const texto = [
          ...mensagens.map((m) => `[${m.timestamp.slice(0, 16)}] ${m.texto ?? `(${m.tipo})`}`),
          empresa.dica ? `Dica do atendente: ${empresa.dica}` : "",
        ].join("\n");
        const r = await escolherEmpresaDoGrupo(empresa.candidatas, texto);
        if (r.companyId) {
          empresa.companyId = r.companyId;
          empresa.fonte = "GRUPO_IA";
        }
        escolhaIa = r.motivo;
      } catch (e) {
        console.error("[pedido-nota] escolha de empresa falhou:", e instanceof Error ? e.message : e);
      }
    }

    const avisos = [
      empresa.grupoComVarias && !empresa.companyId
        ? `Grupo cadastrado em ${empresa.candidatas.length} empresas e a conversa não deixou claro qual${escolhaIa ? ` (${escolhaIa})` : ""}: escolha abaixo.`
        : null,
      falhasAnexo.length ? `Alguns anexos não foram copiados: ${falhasAnexo.join("; ")}` : null,
      empresa.cnpjNaoEncontrado && !empresa.companyId
        ? `O documento ${empresa.cnpjNaoEncontrado} do #nota não é de nenhuma empresa cadastrada (se for do tomador, tudo bem).`
        : null,
    ].filter(Boolean);
    await admin
      .from("pedidos_nota")
      .update({
        telefone,
        contato_nome: contato.internalName || contato.name || null,
        contato_eh_grupo: ehGrupo,
        dica_atendente: empresa.dica,
        company_id: empresa.companyId,
        empresa_fonte: empresa.fonte,
        companies_candidatas: candidatas,
        mensagens,
        anexos,
        status: semMensagem ? "ERRO" : "RECEBIDO",
        erro: semMensagem
          ? "Nenhuma mensagem nova do cliente neste chamado (desde o #nota anterior, no máximo 72h)."
          : avisos.join(" ") || null,
      })
      .eq("id", pedidoId);

    // Fase 2: com empresa definida, a IA já monta o rascunho. Falha aqui não
    // perde o pedido — fica em ERRO com o motivo, e o painel pode reextrair.
    let rascunhos: number | null = null;
    if (!semMensagem && empresa.companyId) {
      try {
        rascunhos = (await extrairPedido(pedidoId)).itens;
      } catch (e) {
        console.error("[pedido-nota] extração falhou:", e instanceof Error ? e.message : e);
      }
    }

    await avisarAtendente(
      comando.contactId,
      montarAviso({
        semMensagem,
        temEmpresa: Boolean(empresa.companyId),
        candidatas: candidatas.length,
        cnpjNaoEncontrado: empresa.cnpjNaoEncontrado,
        mensagens,
        anexos,
        rascunhos,
      }),
    );
    return { pedidoId, motivo: semMensagem ? "sem mensagens do cliente" : rascunhos == null ? "ok (sem rascunho)" : `ok (${rascunhos} rascunho(s))` };
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
  temEmpresa: boolean;
  candidatas: number;
  cnpjNaoEncontrado: string | null;
  mensagens: MensagemGravada[];
  anexos: AnexoGravado[];
  rascunhos: number | null;
}): string {
  if (p.semMensagem) {
    return "⚠️ SOMA Gestão: recebi o #nota, mas não achei mensagem nova do cliente desde o #nota anterior (máx. 72h).";
  }
  const partes = [`${p.mensagens.length} mensagem(ns)`];
  if (p.anexos.length) partes.push(`${p.anexos.length} anexo(s)`);
  const cnpj = p.cnpjNaoEncontrado ? ` O documento ${p.cnpjNaoEncontrado} não é de empresa cadastrada no SOMA Gestão.` : "";
  const empresa = p.temEmpresa
    ? ""
    : p.candidatas > 1
      ? ` Encontrei ${p.candidatas} empresas possíveis: escolha no painel, ou mande "#nota <CNPJ da empresa>".${cnpj}`
      : ` Não identifiquei a empresa: mande "#nota <CNPJ da empresa>" ou escolha no painel.${cnpj}`;
  if (p.rascunhos != null) {
    return p.rascunhos > 0
      ? `✅ SOMA Gestão: ${p.rascunhos} rascunho(s) de nota prontos para aprovação (${partes.join(", ")}).`
      : `⚠️ SOMA Gestão: li ${partes.join(", ")}, mas não identifiquei nenhuma nota. Confira no painel.`;
  }
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
