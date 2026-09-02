import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

const ANO_REGEX = /^\d{4}$/;
const MES_REGEX = /^(0[1-9]|1[0-2])$/;

// Proxy pro DCTFWEB.GERARGUIA31 já cadastrado no backend — gera o PDF da
// guia (DARF) de um período já encerrado na DCTFWeb, inclusive vindo de
// uma apuração do MIT (o encerramento do MIT vira declaração da DCTFWeb
// por baixo dos panos). Só funciona depois que a situação do
// encerramento (ver /mit/situacao/{protocolo}) confirmar ENCERRADA.
export async function GET(
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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/dctfweb/guia/${ano}/${mes}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível gerar a guia agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "Não foi possível gerar a guia." }, { status: 502 });
  }

  const dadosResposta = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const pdfBase64 = dadosResposta?.PDFByteArrayBase64 ?? null;
  if (!pdfBase64) {
    return NextResponse.json({ error: "A Serpro não devolveu o PDF da guia." }, { status: 502 });
  }
  return NextResponse.json({ pdf: pdfBase64 });
}
