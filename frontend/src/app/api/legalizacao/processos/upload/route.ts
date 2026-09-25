import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requirePermissao } from "@/lib/auth";

// Mesmo padrão de /api/legalizacao/upload — token de upload direto-do-
// cliente pro Vercel Blob. Aceita .docx além de PDF/imagem porque minutas
// de contrato/distrato geralmente circulam em Word antes de assinadas.
export async function POST(request: Request) {
  await requirePermissao("legalizacao.editar");

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/msword",
        ],
        addRandomSuffix: true,
        maximumSizeInBytes: 20 * 1024 * 1024,
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao gerar o token de upload." },
      { status: 400 },
    );
  }
}
