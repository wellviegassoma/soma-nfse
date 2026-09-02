import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

const ID_APURACAO_REGEX = /^\d+$/;

// Proxy pro MIT.CONSAPURACAO316 já cadastrado no backend (só leitura,
// cacheado lá) — detalhe de uma apuração específica do MIT (débitos por
// tributo). idApuracao vem de /mit/apuracoes/{ano}.
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; idApuracao: string }> },
) {
  await requireSomaStaff();
  const { companyId, idApuracao } = await props.params;
  if (!ID_APURACAO_REGEX.test(idApuracao)) {
    return NextResponse.json({ error: "idApuracao inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/mit/apuracao/${idApuracao}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar a apuração do MIT agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "Não foi possível consultar." }, { status: 502 });
  }
  return NextResponse.json({ resposta: body.resposta });
}
