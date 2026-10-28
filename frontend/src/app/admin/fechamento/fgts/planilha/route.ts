import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { gerarPlanilhaPendenciasFgts } from "@/lib/fgts-export";

// Só lê o que já foi consultado (fgts_guias_consultas) — não gera
// chamada paga na Infosimples.
export async function GET() {
  await requireSomaStaff();
  const agora = new Date();
  const buffer = await gerarPlanilhaPendenciasFgts(await createClient(), agora);
  const data = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fgts-pendencias-${data}.xlsx"`,
    },
  });
}
