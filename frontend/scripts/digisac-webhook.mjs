// Cadastra (ou lista) o webhook do Digisac que alimenta o pedido de nota.
// Ver docs/pedido-nota-ia.md, Fase 1.
//
//   node scripts/digisac-webhook.mjs listar
//   node scripts/digisac-webhook.mjs cadastrar https://<dominio-de-producao>
//
// Lê DIGISAC_URL, DIGISAC_TOKEN e DIGISAC_WEBHOOK_SECRET do .env.local.
// O segredo vai na URL do webhook e nunca é impresso.
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^DIGISAC_/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
for (const k of ["DIGISAC_URL", "DIGISAC_TOKEN", "DIGISAC_WEBHOOK_SECRET"]) {
  if (!env[k]) throw new Error(`${k} não está no .env.local`);
}
const BASE = `${new URL(env.DIGISAC_URL).origin}/api/v1`;
const H = { Authorization: `Bearer ${env.DIGISAC_TOKEN}`, "Content-Type": "application/json" };

const [acao, dominio] = process.argv.slice(2);

async function listar() {
  const r = await fetch(`${BASE}/me/webhooks?perPage=40`, { headers: H });
  const j = await r.json();
  for (const w of j.data ?? []) {
    const url = new URL(w.url);
    console.log(`${w.id}  ativo=${w.active}  ${url.origin}${url.pathname}  eventos=${(w.events ?? []).join(",")}`);
  }
  if (!(j.data ?? []).length) console.log("Nenhum webhook cadastrado.");
}

if (acao === "listar") {
  await listar();
} else if (acao === "cadastrar") {
  if (!dominio || !/^https:\/\//.test(dominio)) throw new Error("Informe o domínio https de produção.");
  const me = await (await fetch(`${BASE}/me`, { headers: H })).json();
  const url = `${new URL(dominio).origin}/api/digisac/webhook?token=${env.DIGISAC_WEBHOOK_SECRET}`;
  const r = await fetch(`${BASE}/me/webhooks`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      active: true,
      name: "SOMA Gestão — pedido de nota",
      url,
      events: ["message.created"],
      type: "general",
      userId: me.id,
      accountId: me.accountId,
    }),
  });
  console.log("Cadastro:", r.status, r.ok ? "ok" : (await r.text()).slice(0, 300));
  await listar();
} else {
  console.log("Uso: node scripts/digisac-webhook.mjs listar | cadastrar https://<dominio>");
}
