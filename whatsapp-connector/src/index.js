require("dotenv").config();

const express = require("express");
const { exigirTokenInterno } = require("./auth");
const { iniciarConexao, enviarMensagem } = require("./baileys");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Chamado por frontend/src/app/api/atendimento/mensagens/route.ts quando
// um atendente manda mensagem pelo inbox.
app.post("/enviar", exigirTokenInterno, async (req, res) => {
  const { telefone, corpo } = req.body || {};
  if (!telefone || !corpo) {
    return res.status(400).json({ error: "Informe telefone e corpo." });
  }

  try {
    const whatsappMessageId = await enviarMensagem(telefone, corpo);
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
