const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const { obterCliente } = require("./supabaseClient");
const { digitosTelefone } = require("./normalizePhone");

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || "./auth_info_baileys";
const CONEXAO_ID = process.env.ATENDIMENTO_CONEXAO_ID;

const CODIGO_VIOLACAO_UNICA = "23505";

let socketAtual = null;

// Envolve uma operação que só faz leitura + escrita idempotente (achar-ou-
// criar, ou um insert já protegido contra 23505) — retentar a função
// inteira é seguro porque encontrarOuCriarContato/encontrarOuCriarTicketAberto
// releem antes de escrever, e o insert de mensagem trata duplicata como
// sucesso. Cobre o caso mais comum de mensagem perdida: uma falha
// transiente de rede/Supabase, não um erro de configuração.
async function comRetentativas(fn, tentativas = 3, esperaMs = 500) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) {
        await new Promise((resolve) => setTimeout(resolve, esperaMs * (i + 1)));
      }
    }
  }
  throw ultimoErro;
}

async function atualizarConexao(campos) {
  if (!CONEXAO_ID) return;
  const supabase = obterCliente();
  const { error } = await supabase.from("atendimento_conexoes").update(campos).eq("id", CONEXAO_ID);
  if (error) console.error("Falha ao atualizar atendimento_conexoes:", error.message);
}

// Auto-match de empresa por telefone: melhor esforço, nunca bloqueia o
// fluxo principal (ticket é criado com ou sem company_id). A comparação
// em si mora em SQL (atendimento_buscar_company_id_por_telefone, ver
// migration) pra não puxar a tabela company_contatos_setor inteira pela
// rede a cada contato novo.
async function buscarCompanyIdPorTelefone(supabase, telefone) {
  try {
    const { data, error } = await supabase.rpc("atendimento_buscar_company_id_por_telefone", {
      p_telefone: telefone,
    });
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    console.error("Falha no auto-match de empresa por telefone:", err.message);
    return null;
  }
}

async function encontrarOuCriarContato(supabase, { telefone, jid, nomePush }) {
  const { data: existente, error: erroConsulta } = await supabase
    .from("atendimento_contatos")
    .select("id, company_id, jid")
    .eq("conexao_id", CONEXAO_ID)
    .eq("telefone", telefone)
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;
  if (existente) {
    // Auto-cura pra contato criado antes desta correção (sem jid
    // guardado, então enviarMensagem não tinha pra onde responder) —
    // preenche na próxima mensagem recebida em vez de exigir limpeza manual.
    if (!existente.jid && jid) {
      await supabase.from("atendimento_contatos").update({ jid }).eq("id", existente.id);
    }
    return existente;
  }

  const companyId = await buscarCompanyIdPorTelefone(supabase, telefone);

  const { data: novo, error } = await supabase
    .from("atendimento_contatos")
    .insert({ conexao_id: CONEXAO_ID, telefone, jid, nome: nomePush || null, company_id: companyId })
    .select("id, company_id, jid")
    .single();

  if (error) {
    // Outra mensagem do mesmo contato novo venceu a corrida entre o
    // SELECT e o INSERT acima (unique(conexao_id, telefone)) — busca de
    // novo em vez de propagar o erro e perder a mensagem.
    if (error.code === CODIGO_VIOLACAO_UNICA) {
      const { data: jaExistente, error: erroRefetch } = await supabase
        .from("atendimento_contatos")
        .select("id, company_id, jid")
        .eq("conexao_id", CONEXAO_ID)
        .eq("telefone", telefone)
        .single();
      if (erroRefetch) throw erroRefetch;
      return jaExistente;
    }
    throw error;
  }
  return novo;
}

async function encontrarOuCriarTicketAberto(supabase, contatoId) {
  const { data: existente, error: erroConsulta } = await supabase
    .from("atendimento_tickets")
    .select("id")
    .eq("contato_id", contatoId)
    .in("status", ["FILA", "ABERTO"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;
  if (existente) return existente.id;

  const { data: conexao, error: erroConexao } = await supabase
    .from("atendimento_conexoes")
    .select("departamento_padrao_id")
    .eq("id", CONEXAO_ID)
    .single();
  if (erroConexao) throw erroConexao;
  if (!conexao.departamento_padrao_id) {
    throw new Error(
      "atendimento_conexoes.departamento_padrao_id não configurado — defina um departamento padrão antes de receber mensagens.",
    );
  }

  const { data: novo, error } = await supabase
    .from("atendimento_tickets")
    .insert({
      contato_id: contatoId,
      departamento_id: conexao.departamento_padrao_id,
      status: "FILA",
    })
    .select("id")
    .single();
  if (error) throw error;
  return novo.id;
}

// Tipos que embrulham o conteúdo real um nível abaixo (mensagem efêmera,
// "ver uma vez", reencaminhada por outro aparelho) — sem desembrulhar,
// uma mensagem de texto normal escondida atrás de um desses virava
// corpo=null e o atendente não via nada, mesmo a mensagem tendo chegado.
const TIPOS_EMBRULHO = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "deviceSentMessage",
];

function desembrulhar(mensagem) {
  let m = mensagem;
  for (let i = 0; i < TIPOS_EMBRULHO.length && m; i++) {
    const chave = TIPOS_EMBRULHO[i];
    if (m[chave]?.message) {
      m = m[chave].message;
      i = -1; // reinicia a checagem — pode vir embrulhado em mais de uma camada
    }
  }
  return m;
}

function ehEncaminhada(m) {
  return Boolean(
    m.extendedTextMessage?.contextInfo?.isForwarded ||
      m.imageMessage?.contextInfo?.isForwarded ||
      m.videoMessage?.contextInfo?.isForwarded ||
      m.documentMessage?.contextInfo?.isForwarded ||
      m.audioMessage?.contextInfo?.isForwarded ||
      m.stickerMessage?.contextInfo?.isForwarded,
  );
}

// Sempre devolve algo pro atendente ver — mensagem sem texto (áudio,
// figurinha, foto sem legenda, documento, localização) não pode virar
// bolha vazia, e um tipo que a gente ainda não trata explicitamente vira
// um rótulo com o nome do campo (não corpo=null) pra dar pra investigar
// depois e pro atendente pelo menos saber que chegou algo. O
// download/armazenamento do arquivo de mídia em si fica pra uma fase
// seguinte (ver docs/atendimento.md); por enquanto o rótulo já é melhor
// do que nada.
function extrairConteudo(msg) {
  const m = desembrulhar(msg.message || {});
  const prefixo = ehEncaminhada(m) ? "↪ Encaminhada:\n" : "";

  if (m.conversation) return { corpo: prefixo + m.conversation, midiaTipo: null };
  if (m.extendedTextMessage?.text) return { corpo: prefixo + m.extendedTextMessage.text, midiaTipo: null };
  if (m.imageMessage) return { corpo: prefixo + (m.imageMessage.caption || "[Imagem]"), midiaTipo: "image" };
  if (m.videoMessage) return { corpo: prefixo + (m.videoMessage.caption || "[Vídeo]"), midiaTipo: "video" };
  if (m.audioMessage) {
    return { corpo: prefixo + (m.audioMessage.ptt ? "[Áudio]" : "[Arquivo de áudio]"), midiaTipo: "audio" };
  }
  if (m.stickerMessage) return { corpo: prefixo + "[Figurinha]", midiaTipo: "sticker" };
  if (m.documentMessage) {
    return {
      corpo: prefixo + `[Documento: ${m.documentMessage.fileName || "arquivo"}]`,
      midiaTipo: "document",
    };
  }
  if (m.locationMessage) return { corpo: prefixo + "[Localização compartilhada]", midiaTipo: "location" };
  if (m.contactMessage) {
    return { corpo: prefixo + `[Contato: ${m.contactMessage.displayName || "sem nome"}]`, midiaTipo: "contact" };
  }

  const tipos = Object.keys(m);
  if (tipos.length === 0) return { corpo: null, midiaTipo: null };
  return { corpo: `[Mensagem não suportada: ${tipos.join(", ")}]`, midiaTipo: "unsupported" };
}

async function inserirMensagemRecebida(supabase, { ticketId, corpo, midiaTipo, whatsappMessageId }) {
  const { error } = await supabase.from("atendimento_mensagens").insert({
    ticket_id: ticketId,
    remetente_tipo: "CONTATO",
    corpo,
    midia_tipo: midiaTipo,
    whatsapp_message_id: whatsappMessageId,
    status: "RECEBIDA",
  });
  if (error) {
    // Baileys redelivera mensagem recente depois de reconectar, e a
    // retentativa de comRetentativas pode rodar duas vezes se a primeira
    // gravou mas a resposta se perdeu — nos dois casos já está gravada,
    // então 23505 aqui é sucesso, não erro.
    if (error.code === CODIGO_VIOLACAO_UNICA) return;
    throw error;
  }
}

async function registrarMensagemRecebida(msg) {
  if (!CONEXAO_ID || msg.key.fromMe) return;

  const jid = msg.key.remoteJid || "";
  // MVP: só conversa 1:1. Mensagem de grupo/broadcast fica de fora de
  // propósito — vira ticket depois, se a SOMA decidir atender grupo.
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return;

  // O WhatsApp manda parte das conversas com remoteJid em @lid (Linked ID,
  // identificador interno opaco) em vez de @s.whatsapp.net (telefone de
  // verdade) — nos dois casos guardamos o jid completo, porque é ele que
  // enviarMensagem usa pra responder. `telefone` (dígitos do que vier antes
  // do @) continua só pra exibição/auto-match: pra @lid não é um telefone
  // de verdade, mas é estável (mesmo contato sempre cai no mesmo valor).
  const telefone = digitosTelefone(jid.split("@")[0]);
  if (!telefone) return;

  const { corpo, midiaTipo } = extrairConteudo(msg);
  const supabase = obterCliente();

  const contato = await encontrarOuCriarContato(supabase, { telefone, jid, nomePush: msg.pushName });
  const ticketId = await encontrarOuCriarTicketAberto(supabase, contato.id);

  await inserirMensagemRecebida(supabase, {
    ticketId,
    corpo,
    midiaTipo,
    whatsappMessageId: msg.key.id,
  });
}

async function iniciarConexao() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  // Sem fetchLatestBaileysVersion() de propósito: essa chamada busca a
  // versão mais recente do WhatsApp Web numa API externa, sem timeout —
  // se a rede da hospedagem bloquear ou demorar, o processo fica
  // pendurado pra sempre bem antes de qualquer log de erro aparecer. A
  // versão embutida no pacote (usada quando `version` não é passado) é
  // atualizada a cada release do @whiskeysockets/baileys, o que já bastou
  // pro pareamento funcionar.
  const socket = makeWASocket({
    auth: state,
    logger: pino({ level: "warn" }),
    browser: ["SOMA Atendimento", "Chrome", "1.0"],
  });

  socketAtual = socket;
  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrPng = await QRCode.toDataURL(qr);
      await atualizarConexao({ status: "PAREANDO", qr_code: qrPng });
    }

    if (connection === "open") {
      await atualizarConexao({
        status: "CONECTADO",
        qr_code: null,
        numero: socket.user?.id ? digitosTelefone(socket.user.id.split(":")[0]) : null,
        conectado_em: new Date().toISOString(),
      });
    }

    if (connection === "close") {
      // Zera antes de decidir reconectar — sem isso, enviarMensagem()
      // continuaria achando que há uma conexão pronta (seu único guard é
      // `if (!socketAtual)`) e chamaria .sendMessage() num socket morto
      // durante a janela até a reconexão.
      socketAtual = null;
      await atualizarConexao({ status: "DESCONECTADO" });

      // error.output.statusCode vem de @hapi/boom (dependência do próprio
      // Baileys) — DisconnectReason.loggedOut é o único caso em que NÃO
      // devemos tentar reconectar sozinho (sessão foi de fato encerrada
      // pelo celular, precisa de novo QR Code).
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo !== DisconnectReason.loggedOut) {
        setTimeout(() => {
          iniciarConexao().catch((err) => console.error("Falha ao reconectar:", err));
        }, 5_000);
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    // "notify" é a mensagem chegando ao vivo; "append" também precisa ser
    // processado — mensagem recebida durante uma reconexão pode chegar
    // marcada assim (achado real: mensagem encaminhada que sumiu),
    // diferente de "replace" (edição de mensagem já registrada, sem
    // conteúdo novo de verdade).
    if (type !== "notify" && type !== "append") return;
    for (const msg of messages) {
      try {
        await comRetentativas(() => registrarMensagemRecebida(msg));
      } catch (err) {
        console.error("Falha ao registrar mensagem recebida (após retentativas):", err.message);
      }
    }
  });

  return socket;
}

async function enviarMensagem({ jid, telefone, corpo }) {
  if (!socketAtual) {
    throw new Error("Conexão do WhatsApp ainda não está pronta.");
  }
  // Prefere o jid guardado (correto pra @lid e @s.whatsapp.net); só
  // reconstrói a partir do telefone pra contato antigo, de antes desta
  // correção, que ainda não teve o jid preenchido pela auto-cura.
  const destino = jid || `${digitosTelefone(telefone)}@s.whatsapp.net`;
  const resultado = await socketAtual.sendMessage(destino, { text: corpo });
  return resultado?.key?.id ?? null;
}

module.exports = { iniciarConexao, enviarMensagem };
