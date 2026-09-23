const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { put } = require("@vercel/blob");
const fs = require("fs");
const pino = require("pino");
const QRCode = require("qrcode");
const { obterCliente } = require("./supabaseClient");
const { digitosTelefone } = require("./normalizePhone");

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || "./auth_info_baileys";
const CONEXAO_ID = process.env.ATENDIMENTO_CONEXAO_ID;

const CODIGO_VIOLACAO_UNICA = "23505";

let socketAtual = null;
// Some ao processo receber SIGTERM pra reconnect automático não disparar
// depois de um encerramentoDeliberado (ver encerrarConexao).
let encerramentoDeliberado = false;
// IDs de mensagem que a própria enviarMensagem() acabou de mandar — o
// Baileys ecoa de volta toda mensagem enviada (fromMe:true) pelo
// messages.upsert, mesma mensagem que o /api/atendimento/mensagens do
// Next.js já gravou. Sem checar aqui, duplicava a mensagem no inbox toda
// vez que um atendente respondia pelo app.
const idsEnviadosPorNos = new Set();
// Nome do grupo não muda a cada mensagem — evita bater no Baileys
// (groupMetadata) toda hora, só na primeira mensagem de um grupo novo.
const cacheNomesGrupo = new Map();

// Ponto de corte (unix seconds) pra messaging-history.set decidir o que é
// "mensagem perdida" a recuperar — lido do banco (ultima_sincronizacao_em)
// a cada connection==="open", nunca um número fixo. JANELA_PADRAO_SEGUNDOS
// só entra quando não há checkpoint salvo (primeiro pareamento de
// verdade, sem histórico prévio pra comparar).
let checkpointSincronizacaoSegundos = 0;
const JANELA_PADRAO_SEGUNDOS = 24 * 60 * 60;

async function avancarCheckpointSincronizacao() {
  if (!CONEXAO_ID) return;
  const agora = new Date().toISOString();
  checkpointSincronizacaoSegundos = Math.floor(Date.now() / 1000);
  const { error } = await obterCliente()
    .from("atendimento_conexoes")
    .update({ ultima_sincronizacao_em: agora })
    .eq("id", CONEXAO_ID);
  if (error) console.error("Falha ao avançar checkpoint de sincronização:", error.message);
}

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

function ehJidIndividual(jid) {
  return Boolean(jid) && !jid.endsWith("@g.us") && !jid.endsWith("@broadcast") && !jid.endsWith("@newsletter");
}

function ehGrupo(jid) {
  return Boolean(jid) && jid.endsWith("@g.us");
}

async function obterNomeGrupo(socket, jid) {
  if (cacheNomesGrupo.has(jid)) return cacheNomesGrupo.get(jid);
  try {
    const metadata = await socket.groupMetadata(jid);
    const nome = metadata?.subject || null;
    cacheNomesGrupo.set(jid, nome);
    return nome;
  } catch (err) {
    console.error("Falha ao buscar nome do grupo:", err.message);
    return null;
  }
}

// Agenda de contatos do WhatsApp (não confundir com atendimento_contatos,
// que só tem quem já virou chamado) — usada pro seletor de "Nova
// conversa" no inbox. Só guarda contato com nome (salvo no aparelho ou
// pushName) pra não encher a lista de número solto sem identificação.
async function sincronizarContatosWhatsapp(contatos) {
  if (!CONEXAO_ID || !contatos?.length) return;

  const linhas = contatos
    .filter((c) => ehJidIndividual(c.id) && (c.name || c.notify))
    .map((c) => ({
      conexao_id: CONEXAO_ID,
      jid: c.id,
      nome: c.name || c.notify || null,
      telefone: digitosTelefone(c.id.split("@")[0]),
      atualizado_em: new Date().toISOString(),
    }));
  if (linhas.length === 0) return;

  const supabase = obterCliente();
  const { error } = await supabase
    .from("atendimento_contatos_whatsapp")
    .upsert(linhas, { onConflict: "conexao_id,jid" });
  if (error) console.error("Falha ao sincronizar agenda de contatos:", error.message);
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

async function encontrarOuCriarTicketAberto(supabase, contatoId, statusInicial = "FILA") {
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
      status: statusInicial,
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
// depois e pro atendente pelo menos saber que chegou algo. Devolve
// também a mensagem já desembrulhada, pra baixarEArmazenarMidia não
// precisar desembrulhar de novo.
function extrairConteudo(msg) {
  const m = desembrulhar(msg.message || {});
  const prefixo = ehEncaminhada(m) ? "↪ Encaminhada:\n" : "";

  if (m.conversation) return { corpo: prefixo + m.conversation, midiaTipo: null, m };
  if (m.extendedTextMessage?.text) return { corpo: prefixo + m.extendedTextMessage.text, midiaTipo: null, m };
  if (m.imageMessage) return { corpo: prefixo + (m.imageMessage.caption || "[Imagem]"), midiaTipo: "image", m };
  if (m.videoMessage) return { corpo: prefixo + (m.videoMessage.caption || "[Vídeo]"), midiaTipo: "video", m };
  if (m.audioMessage) {
    return { corpo: prefixo + (m.audioMessage.ptt ? "[Áudio]" : "[Arquivo de áudio]"), midiaTipo: "audio", m };
  }
  if (m.stickerMessage) return { corpo: prefixo + "[Figurinha]", midiaTipo: "sticker", m };
  if (m.documentMessage) {
    return {
      corpo: prefixo + `[Documento: ${m.documentMessage.fileName || "arquivo"}]`,
      midiaTipo: "document",
      m,
    };
  }
  if (m.locationMessage) return { corpo: prefixo + "[Localização compartilhada]", midiaTipo: "location", m };
  if (m.contactMessage) {
    return {
      corpo: prefixo + `[Contato: ${m.contactMessage.displayName || "sem nome"}]`,
      midiaTipo: "contact",
      m,
    };
  }

  const tipos = Object.keys(m);
  if (tipos.length === 0 || tipos.every((t) => TIPOS_IGNORADOS.has(t))) {
    // Não é conteúdo de conversa de verdade — mensagem de protocolo
    // interno do WhatsApp (confirmação de entrega, distribuição de
    // chave, reação, edição/exclusão). Criar ticket pra isso é ruído
    // puro — achado real com syncFullHistory ligado, que resincroniza
    // um monte desse tipo de evento junto com mensagem de verdade.
    return { corpo: null, midiaTipo: null, m, ignorar: true };
  }
  return { corpo: `[Mensagem não suportada: ${tipos.join(", ")}]`, midiaTipo: "unsupported", m };
}

const TIPOS_IGNORADOS = new Set([
  "protocolMessage",
  "senderKeyDistributionMessage",
  "messageContextInfo",
  "reactionMessage",
  "pollUpdateMessage",
  "editedMessage",
  "keepInChatMessage",
]);

// Só estes têm arquivo de verdade pra baixar — contato/localização já
// viram texto inteiro em extrairConteudo, e "unsupported" não tem como
// saber que tipo de mídia é (Baileys precisa do node de mídia certo).
const TIPOS_COM_ARQUIVO = new Set(["image", "video", "audio", "sticker", "document"]);

const EXTENSAO_POR_TIPO = { image: "jpg", video: "mp4", audio: "ogg", sticker: "webp" };

function obterExtensao(midiaTipo, m) {
  if (midiaTipo === "document" && m.documentMessage?.fileName?.includes(".")) {
    return m.documentMessage.fileName.split(".").pop();
  }
  return EXTENSAO_POR_TIPO[midiaTipo] || "bin";
}

// Baixa do WhatsApp (descriptografa) e sobe pro Vercel Blob, privado —
// mesmo padrão de Legalização (arquivo não vai pro Postgres, só o
// caminho). Nunca lança: falha aqui não pode derrubar o registro da
// mensagem por inteiro — o atendente ainda vê o rótulo (`[Imagem]` etc.)
// mesmo sem o arquivo baixado.
async function baixarEArmazenarMidia(msg, socket, midiaTipo, m) {
  if (!TIPOS_COM_ARQUIVO.has(midiaTipo) || !process.env.BLOB_READ_WRITE_TOKEN) return null;

  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      { logger: pino({ level: "warn" }), reuploadRequest: socket.updateMediaMessage },
    );
    const extensao = obterExtensao(midiaTipo, m);
    // Nome determinístico (id da própria mensagem do WhatsApp) — uma
    // retentativa de comRetentativas reenviando a mesma mensagem sobe por
    // cima do mesmo arquivo em vez de duplicar no Blob.
    const pathname = `atendimento/${CONEXAO_ID}/${msg.key.id}.${extensao}`;
    const resultado = await put(pathname, buffer, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return { url: resultado.url, pathname: resultado.pathname };
  } catch (err) {
    console.error("Falha ao baixar/guardar mídia:", err.message);
    return null;
  }
}

async function inserirMensagemRecebida(supabase, { ticketId, corpo, midiaTipo, midiaUrl, midiaPathname, whatsappMessageId }) {
  const { error } = await supabase.from("atendimento_mensagens").insert({
    ticket_id: ticketId,
    remetente_tipo: "CONTATO",
    corpo,
    midia_tipo: midiaTipo,
    midia_url: midiaUrl,
    midia_pathname: midiaPathname,
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

// Mensagem mandada direto do celular vinculado (fora do app) — achado
// real testando: enquanto o whatsapp-connector ficava fora do ar, quem
// respondia pelo celular via WhatsApp normal não aparecia em lugar
// nenhum do inbox, deixando outro atendente sem saber que já tinha
// resposta dada. Registra como ATENDENTE sem atendente_id (não dá pra
// saber quem mexeu no celular) — o inbox mostra "Enviado pelo celular"
// nesse caso (ver MensagemBolha em TicketChat.tsx).
async function registrarMensagemEnviadaPeloCelular(msg, socket, jid) {
  const telefone = digitosTelefone(jid.split("@")[0]);
  if (!telefone) return;

  const { corpo, midiaTipo, m, ignorar } = extrairConteudo(msg);
  if (ignorar) return;
  const supabase = obterCliente();

  const nomePush = ehGrupo(jid) ? await obterNomeGrupo(socket, jid) : null;
  const contato = await encontrarOuCriarContato(supabase, { telefone, jid, nomePush });
  const ticketId = await encontrarOuCriarTicketAberto(supabase, contato.id, "ABERTO");

  const midia = midiaTipo ? await baixarEArmazenarMidia(msg, socket, midiaTipo, m) : null;

  const { error } = await supabase.from("atendimento_mensagens").insert({
    ticket_id: ticketId,
    remetente_tipo: "ATENDENTE",
    corpo,
    midia_tipo: midiaTipo,
    midia_url: midia?.url ?? null,
    midia_pathname: midia?.pathname ?? null,
    whatsapp_message_id: msg.key.id,
    status: "ENVIADA",
  });
  if (error && error.code !== CODIGO_VIOLACAO_UNICA) throw error;
}

async function registrarMensagemRecebida(msg, socket) {
  if (!CONEXAO_ID) return;

  const jid = msg.key.remoteJid || "";
  // @broadcast (status) e @newsletter (canal) não são conversa de
  // verdade — grupo (@g.us) agora é tratado como um "contato" à parte
  // (mesmo telefone/jid do grupo), pedido direto de uso real.
  if (jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) return;

  if (msg.key.fromMe) {
    // Eco da nossa própria enviarMensagem() — já registrada pelo
    // /api/atendimento/mensagens do Next.js, não duplica.
    if (idsEnviadosPorNos.has(msg.key.id)) return;
    await registrarMensagemEnviadaPeloCelular(msg, socket, jid);
    return;
  }

  // O WhatsApp manda parte das conversas com remoteJid em @lid (Linked ID,
  // identificador interno opaco) em vez de @s.whatsapp.net (telefone de
  // verdade) — nos dois casos guardamos o jid completo, porque é ele que
  // enviarMensagem usa pra responder. `telefone` (dígitos do que vier antes
  // do @) continua só pra exibição/auto-match: pra @lid/grupo não é um
  // telefone de verdade, mas é estável (mesmo contato sempre cai no
  // mesmo valor).
  const telefone = digitosTelefone(jid.split("@")[0]);
  if (!telefone) return;

  const { corpo: corpoBase, midiaTipo, m, ignorar } = extrairConteudo(msg);
  if (ignorar) return;
  const supabase = obterCliente();

  // Em grupo, pushName é de quem mandou a mensagem dentro do grupo, não
  // do grupo em si — o "contato" (nome do ticket) usa o assunto do
  // grupo, e o corpo ganha o remetente na frente pra não perder quem
  // disse o quê.
  let nomeContato = msg.pushName;
  let corpo = corpoBase;
  if (ehGrupo(jid)) {
    nomeContato = await obterNomeGrupo(socket, jid);
    const remetente =
      msg.pushName || digitosTelefone((msg.key.participant || "").split("@")[0]) || "Alguém";
    corpo = corpoBase ? `*${remetente}:*\n${corpoBase}` : corpoBase;
    // Também aproveita pra guardar o participante na agenda (não só o
    // grupo) — pode ser útil iniciar uma conversa individual com ele depois.
    if (msg.key.participant && msg.pushName) {
      sincronizarContatosWhatsapp([{ id: msg.key.participant, name: msg.pushName }]).catch(() => {});
    }
  } else if (msg.pushName) {
    // contacts.set/contacts.upsert não populou a agenda nessa conta (achado
    // testando) — aproveita toda mensagem recebida com pushName pra ir
    // preenchendo aos poucos, em vez de depender só dos eventos dedicados.
    sincronizarContatosWhatsapp([{ id: jid, name: msg.pushName }]).catch(() => {});
  }

  const contato = await encontrarOuCriarContato(supabase, { telefone, jid, nomePush: nomeContato });
  const ticketId = await encontrarOuCriarTicketAberto(supabase, contato.id);

  const midia = midiaTipo ? await baixarEArmazenarMidia(msg, socket, midiaTipo, m) : null;

  await inserirMensagemRecebida(supabase, {
    ticketId,
    corpo,
    midiaTipo,
    midiaUrl: midia?.url ?? null,
    midiaPathname: midia?.pathname ?? null,
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
    // Sem isso, messaging-history.set manda só um resumo limitado (ótimo
    // pra popular lista de chat, ruim pra recuperar mensagem perdida de
    // verdade) — achado real testando: sessão que precisou de QR novo
    // (não foi só reconexão) não trouxe as mensagens do período fora do
    // ar até ligar isso. Custo: mais dado sincronizado no pareamento
    // inicial (aceitável pro volume de uma linha de atendimento).
    syncFullHistory: true,
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
      // Lê o checkpoint ANTES de sobrescrever — é a partir dele que
      // messaging-history.set decide o que é "mensagem perdida" a
      // recuperar. Sem checkpoint salvo (primeiro pareamento de
      // verdade), cai no padrão de JANELA_PADRAO_SEGUNDOS.
      const { data: conexaoAtual } = await obterCliente()
        .from("atendimento_conexoes")
        .select("ultima_sincronizacao_em")
        .eq("id", CONEXAO_ID)
        .maybeSingle();
      checkpointSincronizacaoSegundos = conexaoAtual?.ultima_sincronizacao_em
        ? Math.floor(new Date(conexaoAtual.ultima_sincronizacao_em).getTime() / 1000)
        : Math.floor(Date.now() / 1000) - JANELA_PADRAO_SEGUNDOS;

      await atualizarConexao({
        status: "CONECTADO",
        qr_code: null,
        numero: socket.user?.id ? digitosTelefone(socket.user.id.split(":")[0]) : null,
        conectado_em: new Date().toISOString(),
        ultima_sincronizacao_em: new Date().toISOString(),
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
      // Baileys). encerramentoDeliberado cobre não reconectar quando o
      // processo está sendo desligado de propósito (deploy) — reconectar
      // aqui só pra ser morto de novo alguns milissegundos depois é
      // trabalho e log inúteis.
      if (encerramentoDeliberado) return;

      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        // Sessão de fato inválida (não é queda de rede) — achado real:
        // sem limpar e tentar de novo, o serviço ficava parado em
        // "Desconectado" pra sempre, sem nunca gerar QR Code novo,
        // exigindo reiniciar manualmente na Railway. Limpa o que sobrou
        // da sessão velha no Volume e já parte pro pareamento novo
        // sozinho.
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (err) {
          console.error("Falha ao limpar sessão antiga:", err.message);
        }
        setTimeout(() => {
          iniciarConexao().catch((err) => console.error("Falha ao reiniciar pareamento:", err));
        }, 2_000);
      } else {
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
        await comRetentativas(() => registrarMensagemRecebida(msg, socket));
      } catch (err) {
        console.error("Falha ao registrar mensagem recebida (após retentativas):", err.message);
      }
    }
    // Mensagem ao vivo processada com sucesso = prova de que a conexão
    // está sincronizada até agora — avança o checkpoint pra próxima
    // reconexão não precisar reprocessar esse trecho de novo.
    avancarCheckpointSincronizacao();
  });

  // O WhatsApp manda mensagem recebida enquanto o processo estava fora do
  // ar (deploy, queda de rede, ou sessão que precisou de QR novo) por
  // este evento, não pelo messages.upsert normal. Usa checkpointSincronizacaoSegundos
  // (o instante exato da última vez que se sabe que a conexão estava em
  // dia, lido no connection==="open" acima) em vez de uma janela fixa —
  // pedido direto testando: número redondo tanto sobrava (reprocessava
  // à toa, inofensivo pela idempotência) quanto faltava (perdia mensagem
  // de queda mais longa que a janela). whatsapp_message_id único (ver
  // migration) evita duplicar o que messages.upsert já pegou.
  socket.ev.on("messaging-history.set", async ({ messages, contacts }) => {
    const recentes = (messages || []).filter((msg) => {
      const timestamp = Number(msg.messageTimestamp) || 0;
      return timestamp > checkpointSincronizacaoSegundos;
    });
    for (const msg of recentes) {
      try {
        await comRetentativas(() => registrarMensagemRecebida(msg, socket));
      } catch (err) {
        console.error("Falha ao sincronizar mensagem do histórico:", err.message);
      }
    }
    avancarCheckpointSincronizacao();

    // Esse pacote inicial de histórico costuma vir com a agenda de
    // contatos junto — sincroniza também daqui, além de contacts.set,
    // porque em algumas contas contacts.set não chega sozinho.
    if (contacts?.length) {
      await sincronizarContatosWhatsapp(contacts).catch((err) =>
        console.error("Falha ao sincronizar contatos do histórico:", err.message),
      );
    }
  });

  // Agenda de contatos pro seletor de "Nova conversa" — contacts.set é o
  // pacote inicial ao parear, contacts.upsert é a atualização contínua
  // (contato novo salvo, nome mudado).
  socket.ev.on("contacts.set", ({ contacts }) => {
    sincronizarContatosWhatsapp(contacts).catch((err) =>
      console.error("Falha ao sincronizar contacts.set:", err.message),
    );
  });
  socket.ev.on("contacts.upsert", (contacts) => {
    sincronizarContatosWhatsapp(contacts).catch((err) =>
      console.error("Falha ao sincronizar contacts.upsert:", err.message),
    );
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

  try {
    const resultado = await socketAtual.sendMessage(destino, { text: corpo });
    const id = resultado?.key?.id ?? null;
    if (id) {
      idsEnviadosPorNos.add(id);
      // Limpa depois de um tempo — só precisa sobreviver até o eco do
      // messages.upsert chegar (normalmente segundos), não pra sempre.
      setTimeout(() => idsEnviadosPorNos.delete(id), 5 * 60 * 1000);
    }
    return id;
  } catch (err) {
    // Contato criado antes do jid existir, com telefone que na verdade é
    // um @lid (não um número de verdade) — a reconstrução acima manda
    // pra um endereço que não existe, e o Baileys quebra com um erro
    // interno confuso em vez de dizer isso. Achado testando: precisa de
    // uma mensagem nova do contato pra auto-cura preencher o jid certo.
    if (!jid) {
      throw new Error(
        "Não foi possível enviar — este contato ainda não tem o endereço de envio salvo. Peça pra ele mandar uma mensagem nova (qualquer uma) que o cadastro se corrige sozinho.",
      );
    }
    throw err;
  }
}

// Chamado no SIGTERM (Railway manda isso antes de matar o container num
// deploy) — fecha o socket de forma limpa (não é logout, a sessão salva
// continua válida) antes do processo morrer. Achado real: sem isso, o
// container antigo podia ser morto no meio de uma escrita do arquivo de
// credencial no Volume (ou os dois processos — antigo e novo do deploy
// seguinte — disputando a mesma sessão do WhatsApp ao mesmo tempo),
// derrubando a sessão e pedindo QR Code de novo a cada deploy.
async function encerrarConexao() {
  encerramentoDeliberado = true;
  if (!socketAtual) return;
  try {
    socketAtual.end(undefined);
  } catch (err) {
    console.error("Falha ao encerrar conexão de forma limpa:", err.message);
  }
  // Dá um tempo pro creds.update pendente (se houver) terminar de
  // escrever no Volume antes do processo ser encerrado de vez.
  await new Promise((resolve) => setTimeout(resolve, 500));
}

module.exports = { iniciarConexao, enviarMensagem, encerrarConexao };
