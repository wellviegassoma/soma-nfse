import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }
  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const proximoMes = mes === 12 ? "01" : String(mes + 1).padStart(2, "0");
  const proximoAno = mes === 12 ? ano + 1 : ano;

  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, legal_name, trade_name")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Empresa sem CNPJ cadastrado." }, { status: 400 });
  }

  const { data: notas } = await supabase
    .from("notas_distribuidas")
    .select(
      "nsu, chave_acesso, data_emissao, xml, prestador_cnpj, tomador_cnpj, numero, competencia, tomador_nome, prestador_nome, descricao_servico, local_incidencia, codigo_trib_nacional, codigo_nbs, aliquota_issqn, valor_servico, valor_issqn, valor_pis, valor_cofins, valor_ret_cp, valor_ret_irrf, cancelada, motivo_cancelamento, bate_competencia",
    )
    .eq("company_id", companyId)
    .gte("competencia", `${competencia}-01`)
    .lt("competencia", `${proximoAno}-${proximoMes}-01`);

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/relatorios/faturamento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        nome_empresa: company.trade_name || company.legal_name,
        cnpj_empresa: company.cnpj,
        ano,
        mes,
        notas: (notas ?? []).map((n) => ({ ...n, nsu: String(n.nsu) })),
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível gerar o relatório agora." }, { status: 502 });
  }

  if (!response.ok) {
    return NextResponse.json({ error: "Não foi possível gerar o relatório agora." }, { status: 502 });
  }

  const pdfBytes = await response.arrayBuffer();
  return new NextResponse(pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-${competencia}.pdf"`,
    },
  });
}
