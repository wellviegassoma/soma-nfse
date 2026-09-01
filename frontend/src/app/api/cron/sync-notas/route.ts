import crypto from "node:crypto";
import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllCompanies } from "@/lib/sync-notas";

// Comparação em tempo constante — evita timing attack pra adivinhar o
// segredo, e falha fechado (nunca autoriza) se CRON_SECRET não estiver
// configurado. Achado real: sem essa checagem, `CRON_SECRET` ausente virava
// a string literal "undefined" na comparação (`Bearer ${undefined}`), e
// mandar o header `Authorization: Bearer undefined` passava despercebido.
function autorizado(authHeader: string | null): boolean {
  const esperado = process.env.CRON_SECRET;
  if (!esperado || !authHeader) return false;
  const a = Buffer.from(authHeader);
  const b = Buffer.from(`Bearer ${esperado}`);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export const maxDuration = 300;

// Empresas por lote — conservador o bastante pra nenhum lote chegar perto
// do maxDuration mesmo no pior caso (empresa com histórico grande +
// retries por instabilidade do adn.nfse.gov.br). Confirmado em produção
// que rodar as ~180 empresas numa chamada só passava de 30 minutos e
// deixava boa parte de fora, silenciosamente — daqui pra frente, cada
// chamada processa só um pedaço e dispara a próxima antes de retornar
// (via `after`, que mantém a função viva o suficiente pra garantir que a
// próxima chamada realmente saiu antes de esta encerrar).
const TAMANHO_LOTE = 20;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!autorizado(authHeader)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const offset = Number(url.searchParams.get("offset") ?? "0") || 0;

  const admin = createAdminClient();
  const { resultados, totalEmpresas, temMais } = await syncAllCompanies(
    admin,
    undefined,
    undefined,
    { offset, limite: TAMANHO_LOTE },
  );

  if (temMais) {
    const proximoOffset = offset + TAMANHO_LOTE;
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
