import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { consultarPagamentosFederais, salvarDasPagamento, situacaoDas } from "@/lib/pagamentos-federais";

export const maxDuration = 90;

// Pagamentos federais (DAS e DARFs) da competência — PAGTOWEB.PAGAMENTOS71,
// UMA consulta por empresa (cobrada; o serviço guarda o resultado do dia).
// Também grava a situação do DAS para a coluna "DAS pago?" da Central Simples.
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia") ?? "";
  if (!/^\d{4}-\d{2}$/.test(competencia)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: company } = await supabase.from("companies").select("cnpj").eq("id", companyId).single();
  if (!company?.cnpj) return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });

  const r = await consultarPagamentosFederais(company.cnpj.replace(/\D/g, ""), competencia);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 502 });

  const das = situacaoDas(r.pagamentos, competencia);
  await salvarDasPagamento(supabase, { companyId, competencia, resultado: das, userId: user?.id ?? null });
  return NextResponse.json({ pagamentos: r.pagamentos, paginaCheia: r.paginaCheia, das });
}
