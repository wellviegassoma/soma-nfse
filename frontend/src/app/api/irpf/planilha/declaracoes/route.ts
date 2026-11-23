import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireIrpfAccess } from "@/lib/auth";
import { planilhaDeclaracoes } from "@/lib/irpf/exportar";
import { exercicioAtual } from "@/lib/irpf/comum";

export async function GET(request: Request) {
  await requireIrpfAccess();
  const ex = Number(new URL(request.url).searchParams.get("ex")) || exercicioAtual();
  const buffer = await planilhaDeclaracoes(await createClient(), ex);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="irpf-declaracoes-${ex}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
