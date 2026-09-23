import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { emitirGuiaIssPetropolis } from "@/lib/iss-petropolis";

// Consolidação de período + emissão da guia são ações reais (criam a
// declaração oficial no Petrópolis) — só chamado depois que o usuário
// confirma explicitamente, vendo o valor de serviços, na tela.
export const maxDuration = 90;

export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const naoAutorizado = await autorizarApi("impostos.emitir_iss");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const body = await request.json().catch(() => ({}));
  const competencia = typeof body.competencia === "string" ? body.competencia : null;
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const resposta = await emitirGuiaIssPetropolis(supabase, companyId, competencia);
  if (!resposta.ok) {
    return NextResponse.json({ error: resposta.erro }, { status: 502 });
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
