import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { contentDispositionInline, prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";

const PERIODO_REGEX = /^\d{6}$/;

// Gera (via GERARDAS12) e devolve o PDF da guia do DAS de uma
// competência já declarada — é o documento que a SOMA manda pro cliente
// pagar. Exige que a declaração daquele período já tenha sido
// transmitida antes (ver .../simples/declarar) — se não, a Serpro
// recusa com mensagem própria, repassada como erro abaixo.
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
    .select("cnpj, codigo_cliente, trade_name, legal_name")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/simples/pgdas-d/das/${periodoApuracao}`,
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
    return NextResponse.json(
      { error: body?.detail ?? "Não foi possível gerar a guia do DAS." },
      { status: 502 },
    );
  }

  const dadosParseados = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const das = Array.isArray(dadosParseados) ? dadosParseados[0] : dadosParseados;
  const pdfBase64: string | undefined = das?.pdf;
  if (!pdfBase64) {
    return NextResponse.json(
      { error: "A Serpro não devolveu o PDF da guia — confira se essa competência já foi declarada." },
      { status: 502 },
    );
  }

  return new NextResponse(Buffer.from(pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(
        `${prefixoArquivoEmpresa(company)} - DAS ${periodoApuracao.slice(4)}-${periodoApuracao.slice(0, 4)}.pdf`,
      ),
    },
  });
}
