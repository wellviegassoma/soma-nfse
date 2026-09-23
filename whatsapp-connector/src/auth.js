// Autenticação interna deste serviço — mesmo padrão do integra-contador e
// do nota-carioca-service (token compartilhado próprio, header
// X-Internal-Token), não reaproveita o token dos outros de propósito
// (serviços isolados).

const crypto = require("crypto");

function exigirTokenInterno(req, res, next) {
  const esperado = process.env.WHATSAPP_CONNECTOR_INTERNAL_TOKEN;
  if (!esperado) {
    return res
      .status(500)
      .json({ error: "WHATSAPP_CONNECTOR_INTERNAL_TOKEN não configurado no servidor." });
  }

  const recebido = req.header("x-internal-token") || "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Token interno inválido." });
  }

  next();
}

module.exports = { exigirTokenInterno };
