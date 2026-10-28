import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSomaStaff } from "@/lib/auth";
import { consultarESalvarGuiasFgts } from "@/lib/fgts-infosimples";
import { periodoFgtsPadrao, periodoValido } from "@/lib/fgts-periodo";

export const maxDuration = 300;

// Consulta paga (Infosimples) — só por POST, pra nenhum prefetch ou
// recarregamento de página gerar cobrança sem querer. `?periodo=AAAAMM`
// escolhe a competência; sem ele, o mês anterior.
export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

  const periodo = new URL(request.url).searchParams.get("periodo") ?? periodoFgtsPadrao();
  if (!periodoValido(periodo)) {
    return NextResponse.json({ error: "Competência inválida (use AAAAMM)." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();

  if (!company?.cnpj) {
    return NextResponse.json(
      { error: "Essa empresa não tem CNPJ cadastrado — a consulta de FGTS é por CNPJ." },
      { status: 400 },
    );
  }

  let resultado;
  try {
    resultado = await consultarESalvarGuiasFgts(createAdminClient(), companyId, company.cnpj, periodo);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  if (resultado.status === "erro") {
    return NextResponse.json({ error: resultado.erro }, { status: 502 });
  }
  return NextResponse.json({
    guias: resultado.guias.length,
    qtdEmAberto: resultado.qtdEmAberto,
    valorEmAberto: resultado.valorEmAberto,
  });
}
