"use client";

import { upload } from "@vercel/blob/client";
import { receberArquivoExtrato } from "@/lib/actions/extratos-arquivos";
import type { ResultadoProcessamento } from "@/lib/extratos-arquivos";

export const ACEITOS = ".pdf,.ofx,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

function tipoDoArquivo(f: File): string | null {
  if (/\.ofx$/i.test(f.name)) return "application/x-ofx";
  if (f.type) return f.type;
  if (/\.pdf$/i.test(f.name)) return "application/pdf";
  return null;
}

/** Sobe o arquivo direto para o Blob e pede a leitura/identificação no servidor. */
export async function enviarExtrato(
  f: File,
  dica: { companyId?: string | null; contaId?: string | null; competencia?: string | null; origem: "UPLOAD" | "LOTE" },
): Promise<{ error?: string; resultado?: ResultadoProcessamento }> {
  const tipo = tipoDoArquivo(f);
  if (!tipo || !["application/pdf", "application/x-ofx", "image/jpeg", "image/png", "image/webp"].includes(tipo)) {
    return { error: `${f.name}: formato não aceito (PDF, OFX ou imagem).` };
  }
  if (f.size > 20 * 1024 * 1024) return { error: `${f.name}: maior que 20 MB.` };
  const nomeSeguro = f.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  let blob;
  try {
    blob = await upload(`extratos/${dica.companyId ?? "lote"}/${Date.now()}-${nomeSeguro}`, f, {
      access: "private",
      handleUploadUrl: "/api/extratos/upload",
      contentType: tipo,
    });
  } catch {
    return { error: `${f.name}: falha no envio do arquivo.` };
  }
  return receberArquivoExtrato({
    blobUrl: blob.url,
    blobPathname: blob.pathname,
    nome: f.name,
    mime: tipo,
    tamanho: f.size,
    origem: dica.origem,
    companyId: dica.companyId ?? null,
    contaId: dica.contaId ?? null,
    competencia: dica.competencia ?? null,
  });
}

/** Processa vários arquivos com concorrência limitada, avisando a cada um. */
export async function enviarVarios(
  arquivos: File[],
  dica: { companyId?: string | null; origem: "UPLOAD" | "LOTE" },
  aoTerminar: (i: number, r: { error?: string; resultado?: ResultadoProcessamento }) => void,
  concorrencia = 3,
) {
  let proximo = 0;
  async function trabalhador() {
    while (proximo < arquivos.length) {
      const i = proximo++;
      aoTerminar(i, await enviarExtrato(arquivos[i], dica).catch(() => ({ error: `${arquivos[i].name}: falha inesperada.` })));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concorrencia, arquivos.length) }, trabalhador));
}
