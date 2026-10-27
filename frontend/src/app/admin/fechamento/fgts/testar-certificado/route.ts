import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSomaStaff } from "@/lib/auth";
import { testarCertificadoProcurador } from "@/lib/fgts-infosimples";

// Consulta gratuita (infosimples/certificado) — confere se o certificado
// da SOMA e a criptografia dos parâmetros estão aceitos, sem custo.
export async function POST() {
  await requireSomaStaff();
  const resultado = await testarCertificadoProcurador(createAdminClient());
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 502 });
}
