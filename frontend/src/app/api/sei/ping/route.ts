import { NextResponse } from "next/server";
import { autorizarApi, getCurrentProfileName } from "@/lib/auth";

// A extensão "SOMA · SEI" usa para saber se o Chrome está logado no SOMA
// com permissão de editar a Legalização.
export async function GET() {
  const negado = await autorizarApi("legalizacao.editar");
  if (negado) return negado;
  return NextResponse.json({ ok: true, usuario: await getCurrentProfileName() });
}
