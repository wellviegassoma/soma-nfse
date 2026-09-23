import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarRotinaFechamento } from "@/lib/rotina-fechamento/autorizar";
import { registrarExecucao, type ResultadoItem } from "@/lib/rotina-fechamento/registrar";
import { emitirGuiaIssPetropolis } from "@/lib/iss-petropolis";

// Etapa 5 da Rotina de Fechamento — AÇÃO REAL: consolida o período e
// emite a guia oficial na Prefeitura de Petrópolis (mesmo nível de
// irreversibilidade de MIT/PGDAS-D). Por isso NUNCA roda em lote
// silencioso: exige `confirmar: true` e a lista explícita de empresas no
// corpo da requisição — quem chama (painel ou chat) decidiu, empresa por
// empresa, que quer emitir.
export const maxDuration = 300;

export async function POST(request: Request) {
  const autorizacao = await autorizarRotinaFechamento(request);
  if (!autorizacao.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const competencia = typeof body.competencia === "string" ? body.competencia : null;
  const companyIds = Array.isArray(body.companyIds) ? body.companyIds.filter((id: unknown) => typeof id === "string") : [];
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Informe competencia (YYYY-MM)." }, { status: 400 });
  }
  if (body.confirmar !== true) {
    return NextResponse.json(
      { error: "Confirmação obrigatória: envie confirmar=true. Isso emite guias reais na Prefeitura." },
      { status: 400 },
    );
  }
  if (companyIds.length === 0) {
    return NextResponse.json({ error: "Informe companyIds (lista de empresas a emitir)." }, { status: 400 });
  }

  const iniciadoEm = new Date();
  const admin = createAdminClient();
  const itens: ResultadoItem[] = [];
  for (const companyId of companyIds) {
    const resposta = await emitirGuiaIssPetropolis(admin, companyId, competencia);
    if (!resposta.ok) {
      itens.push({ companyId, status: "ERRO", detalhes: { erro: resposta.erro } });
      continue;
    }
    itens.push({
      companyId,
      status: "OK",
      detalhes: { valorServicos: resposta.resumo.valorServicos, valorIss: resposta.resumo.valorIss },
    });
  }

  const { execucaoId } = await registrarExecucao(admin, {
    etapa: "iss_petropolis_emitir",
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
    erros: itens.filter((i) => i.status === "ERRO").length,
  });
}
