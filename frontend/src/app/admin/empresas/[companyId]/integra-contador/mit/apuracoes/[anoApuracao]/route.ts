import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

const ANO_REGEX = /^\d{4}$/;

// Proxy pro MIT.LISTAAPURACOES317 já cadastrado no backend (só leitura,
// cacheado lá) — lista as apurações do MIT já encerradas/em edição pra um
// ano, opcionalmente filtrado por mês.
export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string; anoApuracao: string }> },
) {
  await requireSomaStaff();
  const { companyId, anoApuracao } = await props.params;
  if (!ANO_REGEX.test(anoApuracao)) {
    return NextResponse.json({ error: "Ano de apuração inválido (esperado AAAA)." }, { status: 400 });
  }
  const mesApuracao = new URL(request.url).searchParams.get("mesApuracao");

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  const query = mesApuracao ? `?mes_apuracao=${encodeURIComponent(mesApuracao)}` : "";
  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/mit/apuracoes/${anoApuracao}${query}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar as apurações do MIT agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "Não foi possível consultar." }, { status: 502 });
  }
  return NextResponse.json({ resposta: body.resposta });
}
