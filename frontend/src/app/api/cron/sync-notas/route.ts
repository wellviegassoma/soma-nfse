import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllCompanies } from "@/lib/sync-notas";
import { autorizarChamadaInterna } from "@/lib/internal-auth";

export const maxDuration = 300;

// Empresas por lote — teto superior por chamada; `syncAllCompanies`
// também corta o lote mais cedo se o orçamento de tempo apertar (ver
// LIMITE_TEMPO_LOTE_MS em sync-notas.ts), e devolve `proximoOffset`
// real pra nunca pular empresa mesmo quando isso acontece. Cada chamada
// dispara a próxima antes de retornar (via `after`, que mantém a
// função viva o suficiente pra garantir que a próxima chamada realmente
// saiu antes de esta encerrar).
const TAMANHO_LOTE = 20;

export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const authHeader = request.headers.get("authorization");

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0;

  const admin = createAdminClient();
  const { resultados, totalEmpresas, temMais, proximoOffset } = await syncAllCompanies(
    admin,
    undefined,
    undefined,
    { offset, limite: TAMANHO_LOTE },
  );

  if (temMais) {
    const proximaUrl = new URL(request.url);
    proximaUrl.searchParams.set("offset", String(proximoOffset));
    after(async () => {
      await fetch(proximaUrl.toString(), {
        headers: { authorization: authHeader! },
      }).catch(() => {});
    });
  }

  return NextResponse.json({ resultados, offset, totalEmpresas, temMais });
}
