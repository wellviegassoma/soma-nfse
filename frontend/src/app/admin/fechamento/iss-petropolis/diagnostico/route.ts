import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { buscarEmpresaPetropolis } from "@/lib/iss-petropolis";

// SÓ LEITURA (diagnóstico): descreve uma página do ISS de Petrópolis
// (lista fixa no backend, só GET) pra achar onde o site mostra a guia paga.
// Uso: ?companyId=...&pagina=iss-levantamento_debitos.php&params={"st_parcela":"2"}
export async function GET(req: NextRequest) {
  await requireSomaStaff();
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  if (!companyId) return NextResponse.json({ error: "Informe companyId." }, { status: 400 });
  let params: Record<string, string> = {};
  try {
    params = JSON.parse(sp.get("params") ?? "{}");
  } catch {
    return NextResponse.json({ error: "params inválido (JSON)." }, { status: 400 });
  }
  const empresa = await buscarEmpresaPetropolis(await createClient(), companyId);
  if (!empresa.ok) return NextResponse.json({ error: empresa.erro }, { status: empresa.status });

  const r = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/diagnostico`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "" },
    body: JSON.stringify({
      cnpj: empresa.cnpj,
      cmc: empresa.cmc,
      login: empresa.loginProprio?.login,
      senha_md5: empresa.loginProprio?.senhaMd5,
      pagina: sp.get("pagina") ?? "iss-levantamento_debitos.php",
      params,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(90_000),
  });
  const corpo = await r.json().catch(() => null);
  return NextResponse.json(corpo, { status: r.status });
}
