import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarRotinaFechamento } from "@/lib/rotina-fechamento/autorizar";
import { registrarExecucao } from "@/lib/rotina-fechamento/registrar";
import { rodarConferenciaPetropolisParaTodasEmpresas } from "@/lib/iss-petropolis";
import { mesCorrenteBrasilia } from "@/lib/competencia";

// Etapa 4 da Rotina de Fechamento — só leitura, não consolida nem emite
// nada na Prefeitura, só compara o que já está lançado com o faturamento
// do SOMA. Seguro rodar em lote sem confirmação.
export const maxDuration = 300;

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

  const iniciadoEm = new Date();
  const admin = createAdminClient();
  const itens = await rodarConferenciaPetropolisParaTodasEmpresas(admin, competencia);
  const { execucaoId } = await registrarExecucao(admin, {
    etapa: "iss_petropolis_conferir",
    competencia,
    executadoPor: autorizacao.executadoPor,
    itens,
    iniciadoEm,
  });

  return NextResponse.json({
    execucaoId,
    competencia,
    total: itens.length,
    sucessos: itens.filter((i) => i.status === "OK").length,
    divergencias: itens.filter((i) => i.status === "DIVERGENCIA").length,
    erros: itens.filter((i) => i.status === "ERRO").length,
  });
}
