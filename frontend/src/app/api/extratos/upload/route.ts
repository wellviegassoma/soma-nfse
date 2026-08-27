import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireExtratosAccess } from "@/lib/auth";

// Mesmo padrão de /api/legalizacao/upload — upload direto do navegador pro
// Vercel Blob, contornando o limite de corpo de requisição da Vercel.
export async function POST(request: Request) {
  await requireExtratosAccess();

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
