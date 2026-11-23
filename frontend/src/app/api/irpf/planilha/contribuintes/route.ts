import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireIrpfAccess } from "@/lib/auth";
import { planilhaContribuintes } from "@/lib/irpf/exportar";

export async function GET() {
  await requireIrpfAccess();
  const buffer = await planilhaContribuintes(await createClient());
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="irpf-contribuintes.xlsx"',
      "Cache-Control": "private, no-store",
    },
  });
}
