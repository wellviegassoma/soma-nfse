import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularCustoFixoHora, calcularCustoPorUso, calcularProcedimento } from "./engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;
import type {
  PrecificacaoCustoFixo,
  PrecificacaoInsumo,
  PrecificacaoParametros,
  PrecificacaoProcedimentoComReceita,
} from "@/lib/types";
import type { ProcedimentoComMargem } from "@/components/precificacao/ProcedimentosTable";

// Compartilhado entre as duas árvores de rota (staff em /admin/empresas/... e
// cliente em /empresas/...) — as duas leem exatamente os mesmos dados, só a
// casca da página muda.

export async function buscarParametros(
  supabase: AnySupabaseClient,
  companyId: string,
): Promise<PrecificacaoParametros | null> {
  const { data } = await supabase
    .from("precificacao_parametros")
    .select("id, company_id, carga_horaria_mensal, aliquota_imposto, taxa_cartao, desconto_padrao")
    .eq("company_id", companyId)
    .maybeSingle();
  return data;
}

export async function buscarCustosFixos(
  supabase: AnySupabaseClient,
  companyId: string,
): Promise<PrecificacaoCustoFixo[]> {
  const { data } = await supabase
    .from("precificacao_custos_fixos")
    .select("id, company_id, descricao, valor_mensal, ativo")
    .eq("company_id", companyId)
    .order("descricao");
  return data ?? [];
}

export async function buscarInsumos(
  supabase: AnySupabaseClient,
  companyId: string,
): Promise<PrecificacaoInsumo[]> {
  const { data } = await supabase
    .from("precificacao_insumos")
    .select("id, company_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes")
    .eq("company_id", companyId)
    .order("nome");
  return data ?? [];
}

export async function buscarInsumo(
  supabase: AnySupabaseClient,
  insumoId: string,
): Promise<PrecificacaoInsumo | null> {
  const { data } = await supabase
    .from("precificacao_insumos")
    .select("id, company_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes")
    .eq("id", insumoId)
    .maybeSingle();
  return data;
}

/** custo fixo/hora + parâmetros já resolvidos (0 quando ainda não configurado). */
export async function buscarContextoCalculo(supabase: AnySupabaseClient, companyId: string) {
  const [parametros, custosFixos] = await Promise.all([
    buscarParametros(supabase, companyId),
    buscarCustosFixos(supabase, companyId),
  ]);
  const custoFixoHora = parametros
    ? calcularCustoFixoHora(custosFixos, parametros.carga_horaria_mensal)
    : 0;
  return {
    parametros,
    custosFixos,
    custoFixoHora,
    aliquotaImposto: parametros?.aliquota_imposto ?? 0,
    taxaCartao: parametros?.taxa_cartao ?? 0,
    descontoPadrao: parametros?.desconto_padrao ?? 0,
    parametrosConfigurados: parametros != null,
  };
}

export async function buscarProcedimentosComMargem(
  supabase: AnySupabaseClient,
  companyId: string,
): Promise<ProcedimentoComMargem[]> {
  const [{ custoFixoHora, aliquotaImposto, taxaCartao, descontoPadrao }, { data: procedimentos }] =
    await Promise.all([
      buscarContextoCalculo(supabase, companyId),
      supabase
        .from("precificacao_procedimentos")
        .select(
          "id, company_id, nome, especialidade, tempo_atendimento_horas, preco_venda, custo_laboratorio, honorario_profissional_fixo, percentual_retrabalho, ativo, itens:precificacao_procedimento_insumos(id, procedimento_id, insumo_id, quantidade, insumo:precificacao_insumos(id, company_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes))",
        )
        .eq("company_id", companyId)
        .order("nome"),
    ]);

  const linhas = (procedimentos ?? []) as unknown as PrecificacaoProcedimentoComReceita[];

  const rows: ProcedimentoComMargem[] = linhas.map((procedimento) => {
    const resultado = calcularProcedimento({
      tempoAtendimentoHoras: procedimento.tempo_atendimento_horas,
      precoVenda: procedimento.preco_venda,
      custoLaboratorio: procedimento.custo_laboratorio,
      honorarioProfissionalFixo: procedimento.honorario_profissional_fixo,
      percentualRetrabalho: procedimento.percentual_retrabalho,
      itensReceita: procedimento.itens.map((item) => ({
        quantidade: item.quantidade,
        custoPorUso: calcularCustoPorUso(item.insumo),
      })),
      custoFixoHora,
      aliquotaImposto,
      taxaCartao,
      desconto: descontoPadrao,
    });
    return { procedimento, margemPct: resultado.cheio.margemPct, receitaLiquida: resultado.cheio.receitaLiquida };
  });

  return rows.sort((a, b) => a.margemPct - b.margemPct);
}

export async function buscarProcedimentoComReceita(
  supabase: AnySupabaseClient,
  procedimentoId: string,
): Promise<PrecificacaoProcedimentoComReceita | null> {
  const { data } = await supabase
    .from("precificacao_procedimentos")
    .select(
      "id, company_id, nome, especialidade, tempo_atendimento_horas, preco_venda, custo_laboratorio, honorario_profissional_fixo, percentual_retrabalho, ativo, itens:precificacao_procedimento_insumos(id, procedimento_id, insumo_id, quantidade, insumo:precificacao_insumos(id, company_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes))",
    )
    .eq("id", procedimentoId)
    .maybeSingle();
  return data as unknown as PrecificacaoProcedimentoComReceita | null;
}
