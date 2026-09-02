import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { buscarFaturamentoMensal, competenciasTrimestre, somarFaturamento } from "@/lib/faturamento";
import { calcularLucroPresumido, valoresDevidosNoPeriodoMit } from "@/lib/calculo-impostos";
import { montarDeclaracaoMit } from "@/lib/mit-declaracao";

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Nunca aceita o payload de `dados` pronto vindo do navegador — só
// `competencia` e `transmissaoImediata`. O payload de verdade (valores de
// IRPJ/CSLL/PIS/COFINS) é remontado aqui a partir do faturamento real
// registrado no sistema, mesmo padrão de segurança de
// `simples/declarar/route.ts` — um bug ou adulteração no cliente não
// consegue injetar valores diferentes do que foi calculado.
export async function POST(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const user = await requireUser();
  const { companyId } = await props.params;

  const corpo = await request.json().catch(() => null);
  const competencia = typeof corpo?.competencia === "string" ? corpo.competencia : null;
  const transmissaoImediata = corpo?.transmissaoImediata === true;
  if (!competencia || !COMPETENCIA_REGEX.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, tax_regime, irpj_csll_apuracao_mensal")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }
  if (company.tax_regime !== "LUCRO_PRESUMIDO") {
    return NextResponse.json({ error: "O MIT aqui só está disponível pra empresas do Lucro Presumido." }, { status: 400 });
  }

  const notas = await buscarFaturamentoMensal(supabase, companyId);
  const receitaMes = somarFaturamento(notas, [competencia]);
  const mesesTrimestre = competenciasTrimestre(competencia);
  const receitaTrimestre = somarFaturamento(notas, mesesTrimestre);
  const ehUltimoMesDoTrimestre = competencia === mesesTrimestre[2];

  const resultado = calcularLucroPresumido({
    receitaMes,
    receitaTrimestre,
    ehUltimoMesDoTrimestre,
    apuracaoMensal: company.irpj_csll_apuracao_mensal,
    aliquotaIss: null,
  });
  const valoresDevidos = valoresDevidosNoPeriodoMit(resultado);
  const { dados } = montarDeclaracaoMit({ competencia, valoresDevidos, transmissaoImediata });

  let response: Response;
  try {
    response = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/mit/apuracao/declarar`,
      {
        method: "POST",
        headers: {
          "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dados }),
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
    return NextResponse.json({ error: body?.detail ?? "A Serpro recusou o encerramento da apuração." }, { status: 502 });
  }

  // `resposta.dados` vem como STRING JSON (mesmo padrão de
  // situacao-fiscal/simples-declarar) contendo `{protocoloEncerramento, idApuracao}`.
  const dadosResposta = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const protocoloEncerramento = dadosResposta?.protocoloEncerramento ?? null;

  // Melhor esforço: a transmissão pra Serpro já aconteceu de verdade nesse
  // ponto — uma falha ao registrar o histórico auditável não pode fazer a
  // resposta parecer que o encerramento em si falhou.
  if (protocoloEncerramento) {
    await supabase
      .from("integra_contador_mit_encerramentos")
      .insert({
        company_id: companyId,
        competencia,
        protocolo_encerramento: protocoloEncerramento,
        id_apuracao: dadosResposta?.idApuracao ?? null,
        dados_enviados: dados,
        transmitted_by: user.id,
      })
      .then(({ error }) => {
        if (error) console.error("Falha ao registrar histórico de encerramento do MIT:", error);
      });
  }

  return NextResponse.json({ protocoloEncerramento, idApuracao: dadosResposta?.idApuracao ?? null, valoresDevidos });
}
