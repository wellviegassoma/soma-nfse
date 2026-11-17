// Preenchimento inicial de "Grupos do WhatsApp": vincula cada grupo do
// Digisac cujo nome é IDÊNTICO ("SOMA + nome no sistema", ignorando Ltda,
// Dr./Dra. etc.) a UMA única empresa. Parecidos e ambíguos ficam de fora
// (o time confere pela planilha / pela tela da empresa).
//
//   node scripts/vincular-grupos-iniciais.mjs            → só mostra a contagem
//   node scripts/vincular-grupos-iniciais.mjs --aplicar  → grava (fonte NOME_INICIAL)
//
// Não sobrescreve vínculo existente. Lê .env.local (Supabase service role +
// Digisac). Ver docs/pedido-nota-ia.md e a migration fase_bl.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const core = await import("../src/lib/pedido-nota/empresa-core.ts");
const req = createRequire(new URL("../package.json", import.meta.url));
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const aplicar = process.argv.includes("--aplicar");
const s = req("@supabase/supabase-js").createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: cs, error } = await s.from("companies").select("id, cnpj, cpf, legal_name, trade_name");
if (error) throw error;
const empresas = cs.map((c) => ({ id: c.id, cnpj: c.cnpj, cpf: c.cpf, legalName: c.legal_name, tradeName: c.trade_name }));

const B = new URL(env.DIGISAC_URL).origin + "/api/v1";
const H = { Authorization: `Bearer ${env.DIGISAC_TOKEN}` };
const grupos = [];
for (let p = 1; ; p++) {
  const r = await (await fetch(`${B}/contacts?perPage=100&page=${p}&where[isGroup]=true`, { headers: H })).json();
  grupos.push(...(r.data ?? []));
  if (p >= (r.lastPage ?? 1)) break;
}

const linhas = [];
for (const g of grupos) {
  const nome = g.internalName || g.name || "";
  const x = core.empresasPorNome(nome, empresas);
  if (x.exatas.length === 1) {
    linhas.push({ origem: "DIGISAC", origem_contact_id: g.id, company_id: x.exatas[0], fonte: "NOME_INICIAL", grupo_nome: nome });
  }
}
const recentes = linhas.filter((l) => {
  const g = grupos.find((x) => x.id === l.origem_contact_id);
  return g?.lastMessageAt && Date.now() - Date.parse(g.lastMessageAt) < 90 * 86400000;
}).length;
console.log(`grupos: ${grupos.length} | nome idêntico a uma empresa: ${linhas.length} (com conversa em 90 dias: ${recentes}) | empresas distintas: ${new Set(linhas.map((l) => l.company_id)).size}`);

if (!aplicar) {
  console.log("Nada gravado (rode com --aplicar).");
} else {
  const { error: e, count } = await s
    .from("pedido_nota_vinculos")
    .upsert(linhas, { onConflict: "origem,origem_contact_id,company_id", ignoreDuplicates: true, count: "exact" });
  if (e) throw e;
  console.log(`Gravados: ${count ?? "?"} vínculo(s) novo(s).`);
}
