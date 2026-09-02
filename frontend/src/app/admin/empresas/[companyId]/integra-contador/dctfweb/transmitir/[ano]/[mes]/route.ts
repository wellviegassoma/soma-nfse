import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

const ANO_REGEX = /^\d{4}$/;
const MES_REGEX = /^(0[1-9]|1[0-2])$/;

// Proxy pro fluxo de transmitir a declaração da DCTFWeb (consulta XML +
// assina com o certificado da SOMA + DCTFWEB.TRANSDECLARACAO310) —
// necessário quando uma declaração criada via MIT fica "EM ANDAMENTO" e
// bloqueia a geração da guia. Efeito legal real, igual ao encerramento
// do MIT.
export async function POST(
  _request: Request,
  props: { params: Promise<{ companyId: string; ano: string; mes: string }> },
) {
  await requireSomaStaff();
  const { companyId, ano, mes } = await props.params;
  if (!ANO_REGEX.test(ano) || !MES_REGEX.test(mes)) {
    return NextResponse.json({ error: "Ano ou mês inválido." }, { status: 400 });
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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/dctfweb/transmitir/${ano}/${mes}`,
      {
        method: "POST",
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível transmitir a declaração agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "A Serpro recusou a transmissão." }, { status: 502 });
  }

  const dadosResposta = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  return NextResponse.json({ numeroRecibo: dadosResposta?.NumeroRecibo ?? null });
}
