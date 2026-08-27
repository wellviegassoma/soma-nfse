import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireLegalizacaoAccess } from "@/lib/auth";

// Gera o token de upload direto-do-cliente pro Vercel Blob — o arquivo vai
// do navegador direto pro Blob, nunca passa pelo corpo desta rota nem de
// nenhuma Server Action (contorna o limite de ~4,5MB por requisição de
// Serverless Function da Vercel). Essa rota só confirma que quem está
// pedindo o token pode usar o módulo de Legalização e valida tipo/tamanho
// do arquivo antes de assinar o token.
export async function POST(request: Request) {
  await requireLegalizacaoAccess();

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
