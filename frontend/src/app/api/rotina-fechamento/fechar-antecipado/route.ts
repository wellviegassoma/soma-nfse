import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarRotinaFechamento } from "@/lib/rotina-fechamento/autorizar";
import { listarElegiveisFechamentoAntecipado } from "@/lib/rotina-fechamento/elegiveis-fechamento";
import { mesCorrenteBrasilia } from "@/lib/competencia";

export const maxDuration = 60;

// Etapa 6 — GET lista quem já pode fechar (Simples, Anexo III fixo, sem
// Fator R) e ainda não foi marcado; POST marca as escolhidas. Diferente
// das Etapas 2/5 (ISS), aqui não existe ação real numa Prefeitura — só
// um registro interno, por isso não exige confirmar:true.
export async function GET(request: Request) {
  const autorizacao = await autorizarRotinaFechamento(request);
  if (!autorizacao.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const competenciaParam = url.searchParams.get("competencia");
  const competencia =
    competenciaParam && /^\d{4}-\d{2}$/.test(competenciaParam)
      ? competenciaParam
      : mesCorrenteBrasilia();

  const admin = createAdminClient();
  const elegiveis = await listarElegiveisFechamentoAntecipado(admin, competencia);
  return NextResponse.json({ competencia, elegiveis });
}

export async function POST(request: Request) {
  const autorizacao = await autorizarRotinaFechamento(request);
  if (!autorizacao.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const competencia = typeof body.competencia === "string" ? body.competencia : null;
  const companyIds = Array.isArray(body.companyIds)
    ? body.companyIds.filter((id: unknown) => typeof id === "string")
    : [];
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Informe competencia (YYYY-MM)." }, { status: 400 });
  }
  if (companyIds.length === 0) {
    return NextResponse.json({ error: "Informe companyIds (lista de empresas a fechar)." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("fechamentos_mensais").upsert(
    companyIds.map((companyId: string) => ({
      company_id: companyId,
      competencia,
      fechado_por: autorizacao.executadoPor,
      observacoes: typeof body.observacoes === "string" ? body.observacoes : null,
    })),
    { onConflict: "company_id,competencia" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ fechadas: companyIds.length, competencia });
}
