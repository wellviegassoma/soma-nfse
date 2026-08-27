import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

/**
 * Serve o PDF da ÚLTIMA consulta já guardada em integra_contador_cache —
 * lê direto do Supabase, nunca chama o serviço integra-contador. Existe
 * separado da rota .../situacao-fiscal (que consulta de verdade, gastando
 * uma chamada se o cache tiver expirado) justamente pra ver o último
 * resultado nunca custar nada, não importa a idade do cache.
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
    .eq("id_sistema", "SITFIS")
    .eq("id_servico", "RELATORIOSITFIS92")
    .eq("contribuinte_cnpj", company.cnpj)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const dados = cache?.resposta?.dados ? JSON.parse(cache.resposta.dados) : null;
  if (!dados?.pdf) {
    return NextResponse.json({ error: "Nenhuma consulta de situação fiscal encontrada ainda." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(dados.pdf, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="situacao-fiscal-${company.cnpj}.pdf"`,
    },
  });
}
