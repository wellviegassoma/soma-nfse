import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Mesma checagem de sync-notas: comparação em tempo constante e falha fechado
// se CRON_SECRET não estiver configurado (sem isso, `Bearer undefined` passa).
function autorizado(authHeader: string | null): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${esperado}`);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const maxDuration = 300;

/**
 * Completa o horizonte das recorrências ativas de TODAS as empresas
 * (p_company_id nulo). Roda com service role, então a RLS não filtra nada.
 *
 * A geração é idempotente (continua de gerado_ate), então repetir é inofensivo
 * — e como o horizonte padrão é de 12 meses, uma falha aqui não deixa ninguém
 * sem conta agendada no dia seguinte.
 */
export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("fin_gerar_recorrencias", {
    p_company_id: null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ criados: Number(data ?? 0) });
}
