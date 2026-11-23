import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { autorizarApi } from "@/lib/auth";

// Token de upload direto para o Blob privado, pedido pela extensão "SOMA · SEI"
// para cada documento do SEI (mesmo protocolo do upload/IRPF). Direto porque
// há anexos maiores que o limite de corpo de uma função (fotos de 7+ MB).
export async function POST(request: Request) {
  const negado = await autorizarApi("legalizacao.editar");
  if (negado) return negado;
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^sei\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(pathname)) throw new Error("Caminho inválido.");
        return {
          // Curinga só vale em image/*; Word e outros sobem como octet-stream
          // (o tipo real fica em sei_documentos.mime).
          allowedContentTypes: ["application/pdf", "text/html", "text/plain", "image/*", "application/zip", "application/octet-stream"],
          addRandomSuffix: true,
          // Há anexos de vistoria (fotos/vídeo) acima de 100 MB.
          maximumSizeInBytes: 500 * 1024 * 1024,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar o token de upload." },
      { status: 400 },
    );
  }
}
