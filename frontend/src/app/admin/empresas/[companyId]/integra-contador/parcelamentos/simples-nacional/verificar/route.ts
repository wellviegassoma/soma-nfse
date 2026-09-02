import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

type ParcelamentoResumo = {
  numero: number;
  dataDoPedido: number; // AAAAMMDD
  situacao: string;
  dataDaSituacao: number; // AAAAMMDD
};

type DetalhePagamento = {
  mesDaParcela: number; // AAAAMM
  vencimentoDoDas: number; // AAAAMMDD
  dataDeArrecadacao: number; // AAAAMMDD
  valorPago: number;
};

type DetalheParcelamento = {
  numero: number;
  situacao: string;
  consolidacaoOriginal?: {
    valorTotalConsolidado?: number;
    quantidadeParcelas?: number;
    parcelaBasica?: number;
  };
  demonstrativoPagamentos?: DetalhePagamento[];
};

function dataAaaammddParaIso(valor: number): string {
  const texto = String(valor);
  return `${texto.slice(0, 4)}-${texto.slice(4, 6)}-${texto.slice(6, 8)}`;
}

function competenciaAaaammParaTexto(valor: number): string {
  const texto = String(valor);
  return `${texto.slice(0, 4)}-${texto.slice(4, 6)}`;
}

// "Em atraso" = falta mais de 1 mês inteiro entre a última parcela paga
// e o mês corrente — ex.: hoje é setembro, última parcela paga foi
// julho, significa que a de agosto ficou pra trás. Diferença de 1 mês é
// normal (a parcela do mês corrente ainda não venceu/foi processada).
function calcularParcelasEmAtraso(ultimaCompetenciaPaga: string | null): boolean {
  if (!ultimaCompetenciaPaga) return false;
  const [anoPago, mesPago] = ultimaCompetenciaPaga.split("-").map(Number);
  const agora = new Date();
  const mesesDesdeUltimoPagamento =
    (agora.getUTCFullYear() - anoPago) * 12 + (agora.getUTCMonth() + 1 - mesPago);
  return mesesDesdeUltimoPagamento >= 2;
}

// Endpoint que o botão de lote da Central de Parcelamentos chama por
// empresa: busca a lista de parcelamentos (PEDIDOSPARC163), pra cada um
// busca o detalhe (OBTERPARC164), e grava/atualiza
// integra_contador_parcelamentos_sn — mesmo padrão client-loop-por-
// empresa das outras centrais, mas aqui o fan-out lista→detalhe
// acontece nesta única rota por empresa.
export async function POST(
  _request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  await requireSomaStaff();
  const { companyId } = await props.params;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  async function chamarBackend(caminho: string) {
    const resposta = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company!.cnpj}${caminho}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
    const corpo = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      throw new Error(corpo?.detail ?? "A Serpro recusou a consulta.");
    }
    const dadosParseados = corpo.resposta?.dados ? JSON.parse(corpo.resposta.dados) : null;
    return dadosParseados;
  }

  let lista: { parcelamentos?: ParcelamentoResumo[] };
  try {
    lista = await chamarBackend("/parcelamentos/simples-nacional");
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Não foi possível listar os parcelamentos." },
      { status: 502 },
    );
  }

  const parcelamentos = lista?.parcelamentos ?? [];
  let encontrados = 0;
  const falhas: string[] = [];

  for (const resumo of parcelamentos) {
    let detalhe: DetalheParcelamento;
    try {
      detalhe = await chamarBackend(`/parcelamentos/simples-nacional/${resumo.numero}`);
    } catch (e) {
      falhas.push(`parcelamento ${resumo.numero}: ${e instanceof Error ? e.message : "erro desconhecido"}`);
      continue;
    }

    const pagamentos = detalhe.demonstrativoPagamentos ?? [];
    const ultimoPagamento = pagamentos.length > 0 ? pagamentos[pagamentos.length - 1] : null;
    const ultimaCompetenciaPaga = ultimoPagamento
      ? competenciaAaaammParaTexto(ultimoPagamento.mesDaParcela)
      : null;
    const parcelasTotal = detalhe.consolidacaoOriginal?.quantidadeParcelas ?? null;
    const parcelasPagas = pagamentos.length;

    const { error } = await supabase.from("integra_contador_parcelamentos_sn").upsert(
      {
        company_id: companyId,
        numero_parcelamento: resumo.numero,
        situacao: detalhe.situacao ?? resumo.situacao,
        data_pedido: dataAaaammddParaIso(resumo.dataDoPedido),
        data_situacao: dataAaaammddParaIso(resumo.dataDaSituacao),
        parcelas_total: parcelasTotal,
        parcelas_pagas: parcelasPagas,
        parcela_atual: parcelasTotal ? Math.min(parcelasPagas + 1, parcelasTotal) : parcelasPagas + 1,
        parcelas_em_atraso: calcularParcelasEmAtraso(ultimaCompetenciaPaga),
        valor_total_consolidado: detalhe.consolidacaoOriginal?.valorTotalConsolidado ?? null,
        valor_parcela_basica: detalhe.consolidacaoOriginal?.parcelaBasica ?? null,
        ultima_parcela_paga_competencia: ultimaCompetenciaPaga,
        detalhe,
        checked_at: new Date().toISOString(),
      },
      { onConflict: "company_id,numero_parcelamento" },
    );
    if (error) {
      falhas.push(`parcelamento ${resumo.numero}: ${error.message}`);
      continue;
    }
    encontrados += 1;
  }

  return NextResponse.json({ encontrados, total: parcelamentos.length, falhas });
}
