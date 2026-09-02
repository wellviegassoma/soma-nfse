import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { MODALIDADES_PARCELAMENTO } from "@/lib/parcelamento-modalidades";

const NUMERO_REGEX = /^\d+$/;
const PARCELA_REGEX = /^\d{6}$/;

// Proxy pro GERARDAS1XX da modalidade — emite o DAS de uma parcela
// específica. Confirmado (PARCSN, 2026-09-02): a Serpro devolve o PDF
// em `docArrecadacaoPdfB64`, não `pdf`.
export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string; modalidade: string; numero: string }> },
) {
  await requireSomaStaff();
  const { companyId, modalidade, numero } = await props.params;
  if (!MODALIDADES_PARCELAMENTO.some((m) => m.id === modalidade)) {
    return NextResponse.json({ error: "Modalidade de parcelamento inválida." }, { status: 400 });
  }
  if (!NUMERO_REGEX.test(numero)) {
    return NextResponse.json({ error: "Número de parcelamento inválido." }, { status: 400 });
  }
  const parcela = new URL(request.url).searchParams.get("parcela");
  if (!parcela || !PARCELA_REGEX.test(parcela)) {
    return NextResponse.json({ error: "Competência da parcela inválida (esperado AAAAMM)." }, { status: 400 });
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
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/parcelamentos/${modalidade}/${numero}/guia?parcela_para_emitir=${parcela}`,
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

  const dadosParseados = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const pdfBase64: string | undefined = dadosParseados?.docArrecadacaoPdfB64;
  if (!pdfBase64) {
    return NextResponse.json({ error: "A Serpro não devolveu o PDF da guia." }, { status: 502 });
  }

  return new NextResponse(Buffer.from(pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="parcelamento-${modalidade}-${company.cnpj}-${numero}-${parcela}.pdf"`,
    },
  });
}
