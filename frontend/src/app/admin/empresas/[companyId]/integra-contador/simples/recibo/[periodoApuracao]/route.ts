import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

const PERIODO_REGEX = /^\d{6}$/;

// Consulta a última declaração/recibo já transmitida pro período direto
// na Serpro (CONSULTIMADECREC14) — funciona pra qualquer transmissão
// (feita aqui, antes desta feature existir, ou pelo PGDAS-D Web), sem
// depender de nenhum histórico guardado neste sistema.
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; periodoApuracao: string }> },
) {
  await requireSomaStaff();
  const { companyId, periodoApuracao } = await props.params;
  if (!PERIODO_REGEX.test(periodoApuracao)) {
    return NextResponse.json({ error: "Período de apuração inválido (esperado AAAAMM)." }, { status: 400 });
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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/simples/pgdas-d/recibo/${periodoApuracao}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: body?.detail ?? "Não foi possível consultar a declaração/recibo." },
      { status: 502 },
    );
  }

  const dadosParseados = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const declaracao = Array.isArray(dadosParseados) ? dadosParseados[0] : dadosParseados;
  if (!declaracao?.numeroDeclaracao) {
    return NextResponse.json(
      { error: "Nenhuma declaração transmitida encontrada pra essa competência." },
      { status: 404 },
    );
  }

  return NextResponse.json({ resultado: declaracao });
}
