import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllCompanies } from "@/lib/sync-notas";

export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const resumo = await syncAllCompanies(createAdminClient());
  return NextResponse.json({ resumo });
}
