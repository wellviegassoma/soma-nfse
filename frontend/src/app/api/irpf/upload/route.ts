import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireSomaStaff } from "@/lib/auth";

// Upload direto do navegador para o Blob privado (mesmo padrão de
// /api/extratos/upload). .DEC/.REC vão como text/plain; documentos do
// cliente como PDF/imagem. O pathname nunca leva CPF (o cliente gera um id).
export async function POST(request: Request) {
  await requireSomaStaff();
  const body = (await request.json()) as HandleUploadBody;
  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("irpf/")) throw new Error("Caminho inválido.");
        return {
          allowedContentTypes: ["text/plain", "application/pdf", "image/jpeg", "image/png"],
          addRandomSuffix: true,
          maximumSizeInBytes: 20 * 1024 * 1024,
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
