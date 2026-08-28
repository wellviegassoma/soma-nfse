import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import {
  buscarFaturamentoMensal,
  buscarFaturamentoPorAtividade,
  buscarReceitaManual,
  receitaComManual,
} from "@/lib/faturamento";
import { buscarFolhaMensal, totalFolhaComEncargos } from "@/lib/folha";
import { montarDeclaracaoPgdasD } from "@/lib/pgdas-declaracao";

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Nunca aceita o payload de `dados` pronto vindo do navegador — só
// `competencia` e `indicadorTransmissao`. O payload de verdade é
// remontado aqui, a partir do que o sistema realmente tem no Supabase,
// pra um bug ou adulteração no cliente não conseguir injetar valores de
// receita diferentes do que foi calculado.
export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

  const corpo = await request.json().catch(() => null);
  const competencia = typeof corpo?.competencia === "string" ? corpo.competencia : null;
  const indicadorTransmissao = corpo?.indicadorTransmissao === true;
  // Decisão explícita do contador (checkbox na UI) — nunca detectado
  // sozinho a partir de um erro da Serpro dizendo que já existe
  // declaração pro período.
  const tipoDeclaracao: 1 | 2 = corpo?.retificadora === true ? 2 : 1;
  if (!competencia || !COMPETENCIA_REGEX.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json(
      { error: "Essa empresa não tem CNPJ cadastrado — o PGDAS-D só se aplica a CNPJ." },
      { status: 400 },
    );
  }

  const [notasPorAtividade, notasMensais, receitaManualPorMes, folhaMensal] = await Promise.all([
    buscarFaturamentoPorAtividade(supabase, companyId),
    buscarFaturamentoMensal(supabase, companyId),
    buscarReceitaManual(supabase, companyId),
    buscarFolhaMensal(supabase, companyId),
  ]);
  const { receitaPorMes } = receitaComManual(notasMensais, receitaManualPorMes);
  const folhaPorMesMapa = new Map(folhaMensal.map((f) => [f.competencia, totalFolhaComEncargos(f)]));

  const resultado = montarDeclaracaoPgdasD({
    cnpj: company.cnpj,
    competencia,
    indicadorTransmissao,
    tipoDeclaracao,
    notas: notasPorAtividade,
    receitaPorMes,
    folhaPorMes: (mes) => folhaPorMesMapa.get(mes),
  });

  if (resultado.dados === null) {
    return NextResponse.json({ error: "Existem atividades não classificadas.", bloqueios: resultado.bloqueios }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/simples/pgdas-d/declarar`,
      {
        method: "POST",
        headers: {
          "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dados: resultado.dados }),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível falar com o Integra Contador agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { error: body?.detail ?? "A Serpro recusou a declaração." },
      { status: 502 },
    );
  }

  // `resposta.dados` vem como STRING JSON (mesmo padrão de
  // situacao-fiscal/route.ts) contendo uma lista com o objeto
  // DeclaracaoTransmitida — desembrulha aqui pra o cliente já receber
  // objeto pronto.
  const dadosParseados = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const declaracaoTransmitida = Array.isArray(dadosParseados) ? dadosParseados[0] : dadosParseados;

  return NextResponse.json({ resultado: declaracaoTransmitida });
}
