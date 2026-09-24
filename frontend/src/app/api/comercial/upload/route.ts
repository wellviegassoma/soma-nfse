import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requirePermissao } from "@/lib/auth";

// Mesmo padrão de /api/legalizacao/upload — o arquivo vai do navegador
// direto pro Vercel Blob, nunca passa por esta rota nem por nenhuma Server
// Action (contorna o limite de ~4,5MB por requisição de Serverless Function
// da Vercel). Esta rota só confirma permissão e valida tipo/tamanho antes de
// assinar o token.
export async function POST(request: Request) {
  await requirePermissao("comercial.editar");

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["application/pdf", "image/jpeg", "image/png"],
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
