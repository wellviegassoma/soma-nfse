const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const QRCode = require("qrcode");
const { obterCliente } = require("./supabaseClient");
const { digitosTelefone, telefonesCorrespondem } = require("./normalizePhone");

const AUTH_DIR = process.env.BAILEYS_AUTH_DIR || "./auth_info_baileys";
const CONEXAO_ID = process.env.ATENDIMENTO_CONEXAO_ID;

let socketAtual = null;

async function atualizarConexao(campos) {
  if (!CONEXAO_ID) return;
  const supabase = obterCliente();
  const { error } = await supabase.from("atendimento_conexoes").update(campos).eq("id", CONEXAO_ID);
  if (error) console.error("Falha ao atualizar atendimento_conexoes:", error.message);
}

// Auto-match de empresa por telefone: melhor esforço, nunca bloqueia o
// fluxo principal (ticket é criado com ou sem company_id).
async function buscarCompanyIdPorTelefone(supabase, telefone) {
  try {
    const { data } = await supabase.from("company_contatos_setor").select("company_id, telefone");
    const match = (data || []).find((linha) => telefonesCorrespondem(linha.telefone, telefone));
    return match ? match.company_id : null;
  } catch (err) {
    console.error("Falha no auto-match de empresa por telefone:", err.message);
    return null;
  }
}

async function encontrarOuCriarContato(supabase, telefone, nomePush) {
  const { data: existente, error: erroConsulta } = await supabase
    .from("atendimento_contatos")
    .select("id, company_id")
    .eq("conexao_id", CONEXAO_ID)
    .eq("telefone", telefone)
    .maybeSingle();
  if (erroConsulta) throw erroConsulta;
  if (existente) return existente;

  const companyId = await buscarCompanyIdPorTelefone(supabase, telefone);

  const { data: novo, error } = await supabase
    .from("atendimento_contatos")
    .insert({ conexao_id: CONEXAO_ID, telefone, nome: nomePush || null, company_id: companyId })
    .select("id, company_id")
    .single();
  if (error) throw error;
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

function extrairCorpoTexto(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    null
  );
}

async function registrarMensagemRecebida(msg) {
  if (!CONEXAO_ID || msg.key.fromMe) return;

  const jid = msg.key.remoteJid || "";
  // MVP: só conversa 1:1. Mensagem de grupo/broadcast fica de fora de
  // propósito — vira ticket depois, se a SOMA decidir atender grupo.
  if (jid.endsWith("@g.us") || jid.endsWith("@broadcast")) return;

  const telefone = digitosTelefone(jid.split("@")[0]);
  if (!telefone) return;

  const corpo = extrairCorpoTexto(msg);
  const supabase = obterCliente();

  const contato = await encontrarOuCriarContato(supabase, telefone, msg.pushName);
  const ticketId = await encontrarOuCriarTicketAberto(supabase, contato.id);

  const { error } = await supabase.from("atendimento_mensagens").insert({
    ticket_id: ticketId,
    remetente_tipo: "CONTATO",
    corpo,
    whatsapp_message_id: msg.key.id,
    status: "RECEBIDA",
  });
  if (error) throw error;
}

async function iniciarConexao() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
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
    if (type !== "notify") return;
    for (const msg of messages) {
      try {
        await registrarMensagemRecebida(msg);
      } catch (err) {
        console.error("Falha ao registrar mensagem recebida:", err.message);
      }
    }
  });

  return socket;
}

async function enviarMensagem(telefoneDestino, corpo) {
  if (!socketAtual) {
    throw new Error("Conexão do WhatsApp ainda não está pronta.");
  }
  const jid = `${digitosTelefone(telefoneDestino)}@s.whatsapp.net`;
  const resultado = await socketAtual.sendMessage(jid, { text: corpo });
  return resultado?.key?.id ?? null;
}

module.exports = { iniciarConexao, enviarMensagem };
