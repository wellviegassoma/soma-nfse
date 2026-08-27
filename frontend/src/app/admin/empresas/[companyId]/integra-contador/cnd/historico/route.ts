import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

/**
 * Serve o PDF da ÚLTIMA CND já guardada em integra_contador_cache — lê
 * direto do Supabase, nunca chama o serviço integra-contador. Ver
 * situacao-fiscal/historico/route.ts pra explicação do porquê essa rota
 * existe separada da .../cnd (que consulta de verdade).
 */
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
    return NextResponse.json({ error: "Empresa sem CNPJ cadastrado." }, { status: 400 });
  }

  const { data: cache } = await supabase
    .from("integra_contador_cache")
    .select("resposta")
    .eq("id_sistema", "CONSULTACND")
    .eq("id_servico", "CERTIDAO")
    .eq("contribuinte_cnpj", company.cnpj)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pdfBase64: string | undefined = cache?.resposta?.Certidao?.DocumentoPdf;
  if (!pdfBase64) {
    return NextResponse.json({ error: "Nenhuma CND com PDF encontrada ainda." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(pdfBase64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="cnd-${company.cnpj}.pdf"`,
    },
  });
}
