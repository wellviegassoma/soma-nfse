import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { MODALIDADES_PARCELAMENTO } from "@/lib/parcelamento-modalidades";

// Proxy pro PEDIDOSPARC1XX da modalidade — lista os números de
// parcelamento que esse contribuinte já pediu. Devolve `resposta` crua.
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; modalidade: string }> },
) {
  await requireSomaStaff();
  const { companyId, modalidade } = await props.params;
  if (!MODALIDADES_PARCELAMENTO.some((m) => m.id === modalidade)) {
    return NextResponse.json({ error: "Modalidade de parcelamento inválida." }, { status: 400 });
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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/parcelamentos/${modalidade}`,
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
