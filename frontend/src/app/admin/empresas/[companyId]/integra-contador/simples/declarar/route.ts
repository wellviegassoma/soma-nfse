import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import {
  buscarFaturamentoMensal,
  buscarFaturamentoPorAtividade,
  buscarReceitaManual,
  receitaComManual,
} from "@/lib/faturamento";
import { buscarFolhaMensal, totalFolhaComEncargos } from "@/lib/folha";
import { montarDeclaracaoPgdasD, removerPeriodoDesnecessario } from "@/lib/pgdas-declaracao";
import {
  COLUNAS_EMPRESA_SIMPLES,
  buscarExtrasConferencia,
  calcularSimplesEmpresa,
  type EmpresaSimples,
} from "@/lib/simples-linha";

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
  const user = await requireUser();
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
    .select(COLUNAS_EMPRESA_SIMPLES)
    .eq("id", companyId)
    .single<EmpresaSimples>();
  if (!company?.cnpj) {
    return NextResponse.json(
      { error: "Essa empresa não tem CNPJ cadastrado — o PGDAS-D só se aplica a CNPJ." },
      { status: 400 },
    );
  }

  // Travas de transmissão (simulação continua livre). Checadas aqui no
  // servidor, não só na tela — vale tanto pro lote da Central Simples
  // quanto pro card individual da aba Impostos.
  if (indicadorTransmissao) {
    // 1. Nunca transmite uma declaração ORIGINAL duas vezes pra mesma
    //    competência — protege contra clique duplo e contra repetição
    //    depois de um timeout em que a primeira chamada chegou a passar.
    //    Retificadora é decisão explícita e segue liberada.
    if (tipoDeclaracao === 1) {
      const { data: existente } = await supabase
        .from("integra_contador_pgdas_declaracoes")
        .select("id_declaracao")
        .eq("company_id", companyId)
        .eq("competencia", competencia)
        .not("id_declaracao", "is", null)
        .limit(1)
        .maybeSingle();
      if (existente?.id_declaracao) {
        return NextResponse.json(
          {
            error: `Já existe declaração transmitida pra ${competencia} (${existente.id_declaracao}). Para corrigir, transmita como retificadora.`,
            jaDeclarada: true,
            idDeclaracao: existente.id_declaracao,
          },
          { status: 409 },
        );
      }
    }

    // 2. Conferência do fechamento (lib/simples-conferencia.ts): só
    //    transmite empresa OK ou em "Revisar" com aprovação válida.
    const extras = await buscarExtrasConferencia(supabase, competencia, [companyId]);
    const calculo = await calcularSimplesEmpresa(supabase, company, competencia, {
      prefeitura: extras.prefeitura.get(companyId) ?? null,
      aprovacao: extras.aprovacoes.get(companyId) ?? null,
    });
    if (!calculo.liberado) {
      const aprovacaoVencida =
        calculo.conferencia.status === "REVISAR" && extras.aprovacoes.has(companyId);
      const cabecalho =
        calculo.conferencia.status === "BLOQUEADO"
          ? "Conferência bloqueou a transmissão"
          : aprovacaoVencida
            ? "Os números mudaram depois da aprovação — confira e aprove de novo na Central Simples Nacional"
            : "Conferência pede revisão — aprove na Central Simples Nacional antes de transmitir";
      return NextResponse.json(
        {
          error: `${cabecalho}: ${calculo.conferencia.motivos.map((m) => m.texto).join(" ")}`,
          conferencia: calculo.conferencia,
        },
        { status: 409 },
      );
    }
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
    dataAbertura: company.data_abertura,
  });

  if (resultado.dados === null) {
    return NextResponse.json({ error: "Existem atividades não classificadas.", bloqueios: resultado.bloqueios }, { status: 400 });
  }

  // A Serpro recusa mês de receita/folha "desnecessário" (depende da data de
  // abertura da empresa). Se apontar um mês com valor ZERO, reenvia sem ele —
  // a recusa é só de validação (nada foi transmitido); mês com valor nunca é
  // descartado (ver removerPeriodoDesnecessario).
  let dadosEnviados = resultado.dados;
  let response: Response;
  let body: { detail?: string; resposta?: { dados?: string } } | null = null;
  for (let tentativa = 0; ; tentativa++) {
    try {
      response = await fetch(
        `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/simples/pgdas-d/declarar`,
        {
          method: "POST",
          headers: {
            "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dados: dadosEnviados }),
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

    body = await response.json().catch(() => null);
    if (response.ok || tentativa >= 12) break;
    const corrigido = removerPeriodoDesnecessario(dadosEnviados, String(body?.detail ?? ""));
    if (!corrigido) break;
    dadosEnviados = corrigido;
  }

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
  const dadosParseados = body?.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const declaracaoTransmitida = Array.isArray(dadosParseados) ? dadosParseados[0] : dadosParseados;

  // Melhor esforço: a transmissão pra Serpro já aconteceu de verdade nesse
  // ponto (só quando indicadorTransmissao=true — nunca registra simulação)
  // — uma falha ao gravar o histórico não pode fazer a resposta parecer
  // que a declaração em si falhou. Mesmo padrão de mit/declarar/route.ts.
  if (indicadorTransmissao && declaracaoTransmitida?.idDeclaracao) {
    const valoresDevidos = Array.isArray(declaracaoTransmitida.valoresDevidos)
      ? (declaracaoTransmitida.valoresDevidos as { valor: number }[])
      : [];
    const valorTotal = valoresDevidos.reduce((acc, v) => acc + Number(v.valor ?? 0), 0);
    // Com await: sem ele a função serverless pode ser encerrada logo
    // depois da resposta e o registro se perder — e é esse registro que
    // impede uma segunda transmissão original da mesma competência.
    const { error: erroHistorico } = await supabase.from("integra_contador_pgdas_declaracoes").insert({
      company_id: companyId,
      competencia,
      id_declaracao: declaracaoTransmitida.idDeclaracao,
      data_hora_transmissao: declaracaoTransmitida.dataHoraTransmissao ?? null,
      valor_total: valorTotal,
      dados_enviados: dadosEnviados,
      transmitted_by: user.id,
    });
    if (erroHistorico) console.error("Falha ao registrar histórico de declaração do PGDAS-D:", erroHistorico);
  }

  return NextResponse.json({ resultado: declaracaoTransmitida });
}
