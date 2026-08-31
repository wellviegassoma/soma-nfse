import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PrecificacaoModelo,
  PrecificacaoModeloComContagem,
  PrecificacaoModeloInsumo,
  PrecificacaoModeloProcedimento,
} from "@/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

const MODELO_COLUMNS = "id, nome, especialidade, descricao, ativo";

export async function buscarModelosAtivos(
  supabase: AnySupabaseClient,
): Promise<PrecificacaoModeloComContagem[]> {
  const { data: modelos } = await supabase
    .from("precificacao_modelos")
    .select(MODELO_COLUMNS)
    .eq("ativo", true)
    .order("nome");
  if (!modelos || modelos.length === 0) return [];

  const modeloIds = modelos.map((m: PrecificacaoModelo) => m.id);
  const [{ data: insumos }, { data: procedimentos }] = await Promise.all([
    supabase.from("precificacao_modelo_insumos").select("modelo_id").in("modelo_id", modeloIds),
    supabase.from("precificacao_modelo_procedimentos").select("modelo_id").in("modelo_id", modeloIds),
  ]);

  const contarPor = (rows: { modelo_id: string }[] | null, modeloId: string) =>
    (rows ?? []).filter((r) => r.modelo_id === modeloId).length;

  return modelos.map((modelo: PrecificacaoModelo) => ({
    ...modelo,
    totalInsumos: contarPor(insumos, modelo.id),
    totalProcedimentos: contarPor(procedimentos, modelo.id),
  }));
}

export async function buscarTodosModelos(
  supabase: AnySupabaseClient,
): Promise<PrecificacaoModeloComContagem[]> {
  const { data: modelos } = await supabase.from("precificacao_modelos").select(MODELO_COLUMNS).order("nome");
  if (!modelos || modelos.length === 0) return [];

  const modeloIds = modelos.map((m: PrecificacaoModelo) => m.id);
  const [{ data: insumos }, { data: procedimentos }] = await Promise.all([
    supabase.from("precificacao_modelo_insumos").select("modelo_id").in("modelo_id", modeloIds),
    supabase.from("precificacao_modelo_procedimentos").select("modelo_id").in("modelo_id", modeloIds),
  ]);

  const contarPor = (rows: { modelo_id: string }[] | null, modeloId: string) =>
    (rows ?? []).filter((r) => r.modelo_id === modeloId).length;

  return modelos.map((modelo: PrecificacaoModelo) => ({
    ...modelo,
    totalInsumos: contarPor(insumos, modelo.id),
    totalProcedimentos: contarPor(procedimentos, modelo.id),
  }));
}

export async function buscarModelo(
  supabase: AnySupabaseClient,
  modeloId: string,
): Promise<PrecificacaoModelo | null> {
  const { data } = await supabase.from("precificacao_modelos").select(MODELO_COLUMNS).eq("id", modeloId).maybeSingle();
  return data;
}

export async function buscarModeloInsumos(
  supabase: AnySupabaseClient,
  modeloId: string,
): Promise<PrecificacaoModeloInsumo[]> {
  const { data } = await supabase
    .from("precificacao_modelo_insumos")
    .select("id, modelo_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes")
    .eq("modelo_id", modeloId)
    .order("nome");
  return data ?? [];
}

export async function buscarModeloInsumo(
  supabase: AnySupabaseClient,
  modeloInsumoId: string,
): Promise<PrecificacaoModeloInsumo | null> {
  const { data } = await supabase
    .from("precificacao_modelo_insumos")
    .select("id, modelo_id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes")
    .eq("id", modeloInsumoId)
    .maybeSingle();
  return data;
}

export async function buscarModeloProcedimentos(
  supabase: AnySupabaseClient,
  modeloId: string,
): Promise<PrecificacaoModeloProcedimento[]> {
  const { data } = await supabase
    .from("precificacao_modelo_procedimentos")
    .select(
      "id, modelo_id, nome, especialidade, tempo_atendimento_horas, preco_venda, custo_laboratorio, honorario_profissional_fixo, percentual_retrabalho, ativo",
    )
    .eq("modelo_id", modeloId)
    .order("nome");
  return data ?? [];
}

export async function buscarModeloProcedimento(
  supabase: AnySupabaseClient,
  modeloProcedimentoId: string,
): Promise<PrecificacaoModeloProcedimento | null> {
  const { data } = await supabase
    .from("precificacao_modelo_procedimentos")
    .select(
      "id, modelo_id, nome, especialidade, tempo_atendimento_horas, preco_venda, custo_laboratorio, honorario_profissional_fixo, percentual_retrabalho, ativo",
    )
    .eq("id", modeloProcedimentoId)
    .maybeSingle();
  return data;
}
