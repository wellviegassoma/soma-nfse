import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

// Proxy pro PARCSN.PEDIDOSPARC163 já cadastrado no backend (cacheado
// 24h lá) — lista os números de parcelamento do Simples Nacional que
// esse contribuinte já pediu. Devolve `resposta` crua (sem desembrulhar
// nada) — formato exato ainda em confirmação (Passo 0 da Central de
// Parcelamentos).
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/parcelamentos/simples-nacional`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar os parcelamentos agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "Não foi possível consultar." }, { status: 502 });
  }
  return NextResponse.json({ resposta: body.resposta });
}
