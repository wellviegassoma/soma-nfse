import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarRotinaFechamento } from "@/lib/rotina-fechamento/autorizar";
import { registrarExecucao } from "@/lib/rotina-fechamento/registrar";
import { rodarIssRjParaTodasEmpresas } from "@/lib/iss-rj";
import { mesCorrenteBrasilia } from "@/lib/competencia";

// Etapas 2+3 da Rotina de Fechamento: busca (emitindo se preciso — ver
// docstring de nota_carioca_client.py, é uma ação real) a guia de ISS do
// Rio de Janeiro de cada Lucro Presumido do município, e confere contra
// o faturamento do SOMA quando o regime não é fixo por profissional.
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
  const itens = await rodarIssRjParaTodasEmpresas(admin, competencia);
  const { execucaoId } = await registrarExecucao(admin, {
    etapa: "iss_rj",
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
