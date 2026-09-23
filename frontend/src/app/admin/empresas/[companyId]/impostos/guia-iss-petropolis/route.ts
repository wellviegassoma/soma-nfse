import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { conferirBaseCalculoPetropolis } from "@/lib/iss-petropolis";

export const maxDuration = 90;

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const resposta = await conferirBaseCalculoPetropolis(supabase, companyId, competencia);
  if (!resposta.ok) {
    return NextResponse.json({ error: resposta.erro }, { status: 502 });
  }

  // 200 com corpo JSON = período ainda não consolidado (não é um erro,
  // é um estado — o frontend oferece consolidar e buscar de novo).
  if (!resposta.consolidado) {
    return NextResponse.json({
      consolidado: false,
      valor_servicos: round2(resposta.resumo.valorServicos),
      valor_iss: round2(resposta.resumo.valorIss),
    });
  }

  return new NextResponse(resposta.pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="guia-iss-petropolis-${competencia ?? "atual"}.pdf"`,
      "X-Valor-Servicos": resposta.resumo.valorServicos.toFixed(2),
      "X-Valor-Iss": resposta.resumo.valorIss.toFixed(2),
    },
  });
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
