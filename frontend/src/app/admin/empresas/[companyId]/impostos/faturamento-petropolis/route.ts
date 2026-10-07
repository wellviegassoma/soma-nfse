import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { consultarFaturamentoPetropolis } from "@/lib/iss-petropolis";

export const maxDuration = 90;

// Só leitura — devolve o que o ISS de Petrópolis mostra pro período (inclui
// as linhas brutas da tela, pra conferir Normal x Retido).
export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const resposta = await consultarFaturamentoPetropolis(supabase, companyId, competencia);
  if (!resposta.ok) return NextResponse.json({ error: resposta.erro }, { status: 502 });
  return NextResponse.json({ valorServicos: resposta.valorServicos, linhas: resposta.linhas });
}
