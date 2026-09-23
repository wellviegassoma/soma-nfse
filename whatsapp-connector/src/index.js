require("dotenv").config();

const express = require("express");
const { exigirTokenInterno } = require("./auth");
const { iniciarConexao, enviarMensagem, encerrarConexao } = require("./baileys");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Chamado por frontend/src/app/api/atendimento/mensagens/route.ts quando
// um atendente manda mensagem pelo inbox.
app.post("/enviar", exigirTokenInterno, async (req, res) => {
  const { jid, telefone, corpo } = req.body || {};
  if (!(jid || telefone) || !corpo) {
    return res.status(400).json({ error: "Informe jid ou telefone, e corpo." });
  }

  try {
    const whatsappMessageId = await enviarMensagem({ jid, telefone, corpo });
    res.json({ whatsapp_message_id: whatsappMessageId });
  } catch (err) {
    console.error("Falha ao enviar mensagem:", err.message);
    res.status(502).json({ error: err.message || "Falha ao enviar mensagem." });
  }
});

const port = process.env.PORT || 3333;
app.listen(port, () => {
  console.log(`whatsapp-connector ouvindo na porta ${port}`);
  iniciarConexao().catch((err) => {
    console.error("Falha ao iniciar conexão com o WhatsApp:", err);
  });
});

// Railway manda SIGTERM antes de matar o container num deploy — sem
// tratar isso, o processo antigo podia morrer no meio da troca de sessão
// do WhatsApp (ou de uma escrita de credencial no Volume) e a conexão
// pedia QR Code de novo a cada deploy. encerrarConexao() fecha o socket
// de forma limpa antes do processo sair.
async function encerrarComCalma(sinal) {
  console.log(`${sinal} recebido — encerrando conexão do WhatsApp antes de sair.`);
  await encerrarConexao();
  process.exit(0);
}

process.on("SIGTERM", () => encerrarComCalma("SIGTERM"));
process.on("SIGINT", () => encerrarComCalma("SIGINT"));
