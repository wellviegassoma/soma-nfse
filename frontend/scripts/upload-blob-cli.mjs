#!/usr/bin/env node
// Helper de linha de comando pro script de importação do Trello
// (scripts/import-comercial-trello/gravar.py) — reaproveita o `put()`
// oficial do @vercel/blob (o mesmo usado pelo resto do app) em vez de
// reimplementar o contrato REST do Blob num script Python à parte. Não é
// código do produto: não é importado por nenhuma rota, só invocado via
// `node frontend/scripts/upload-blob-cli.mjs <arquivoLocal> <pathname>`.
//
// Lê BLOB_READ_WRITE_TOKEN de frontend/.env.local manualmente (rodando fora
// do Next.js, não tem o carregamento automático de env do framework).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { put } from "@vercel/blob";

const __dirname = dirname(fileURLToPath(import.meta.url));

function lerEnvLocal(chave) {
  const envPath = join(__dirname, "..", ".env.local");
  const texto = readFileSync(envPath, "utf-8");
  const linha = texto.split("\n").find((l) => l.startsWith(`${chave}=`));
  if (!linha) throw new Error(`${chave} não encontrado em frontend/.env.local`);
  return linha.slice(chave.length + 1).trim();
}

async function main() {
  const [arquivoLocal, pathname] = process.argv.slice(2);
  if (!arquivoLocal || !pathname) {
    console.error("Uso: node upload-blob-cli.mjs <arquivoLocal> <pathname>");
    process.exit(1);
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    process.env.BLOB_READ_WRITE_TOKEN = lerEnvLocal("BLOB_READ_WRITE_TOKEN");
  }

  const bytes = readFileSync(arquivoLocal);
  const blob = await put(pathname, bytes, { access: "private", addRandomSuffix: true });
  console.log(JSON.stringify({ url: blob.url, pathname: blob.pathname }));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
