"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requirePrecificacaoAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";

const numeroBr = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : 0;
const percentualParaFracao = (v: unknown) => {
  const n = numeroBr(v);
  return n === undefined ? undefined : n / 100;
};

const ADMIN_BASE = "/admin/precificacao-modelos";

// ---------------------------------------------------------------------------
// Modelo (CRUD só para equipe SOMA — biblioteca global, não escopada por empresa)
// ---------------------------------------------------------------------------

const modeloSchema = z.object({
  modeloId: uuidLike.optional(),
  nome: z.string().trim().min(2, "Informe o nome do modelo."),
  especialidade: z.string().trim().optional(),
  descricao: z.string().trim().optional(),
  ativo: z.coerce.boolean(),
});

export async function saveModelo(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireSomaStaff();
  const parsed = modeloSchema.safeParse({
    modeloId: formData.get("modeloId") || undefined,
    nome: formData.get("nome"),
    especialidade: formData.get("especialidade") || undefined,
    descricao: formData.get("descricao") || undefined,
    ativo: formData.get("ativo") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { modeloId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    nome: rest.nome,
    especialidade: rest.especialidade || null,
    descricao: rest.descricao || null,
    ativo: rest.ativo,
  };

  const { data: saved, error } = modeloId
    ? await supabase.from("precificacao_modelos").update(payload).eq("id", modeloId).select("id").single()
    : await supabase.from("precificacao_modelos").insert(payload).select("id").single();

  if (error || !saved) return { error: "Não foi possível salvar o modelo." };

  await logAudit({ action: modeloId ? "UPDATE" : "CREATE", entity: "precificacao_modelo", entityId: saved.id, newValue: payload });
  revalidatePath(ADMIN_BASE, "layout");
  redirect(`${ADMIN_BASE}/${saved.id}`);
}

export async function deleteModelo(modeloId: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("precificacao_modelos").delete().eq("id", modeloId);
  await logAudit({ action: "DELETE", entity: "precificacao_modelo", entityId: modeloId });
  revalidatePath(ADMIN_BASE, "layout");
  redirect(ADMIN_BASE);
}

// ---------------------------------------------------------------------------
// Insumos do modelo
// ---------------------------------------------------------------------------

const modeloInsumoSchema = z.object({
  modeloInsumoId: uuidLike.optional(),
  modeloId: uuidLike,
  nome: z.string().trim().min(2, "Informe o nome do insumo."),
  unidadeCompra: z.string().trim().optional(),
  quantidadePorCompra: z.string().transform(numeroBr).pipe(z.number().positive("Quantidade por compra deve ser maior que zero.")),
  valorCompra: z.string().transform(numeroBr).pipe(z.number().min(0)),
  observacoes: z.string().trim().optional(),
});

export async function saveModeloInsumo(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireSomaStaff();
  const parsed = modeloInsumoSchema.safeParse({
    modeloInsumoId: formData.get("modeloInsumoId") || undefined,
    modeloId: formData.get("modeloId"),
    nome: formData.get("nome"),
    unidadeCompra: formData.get("unidadeCompra") || undefined,
    quantidadePorCompra: formData.get("quantidadePorCompra"),
    valorCompra: formData.get("valorCompra"),
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { modeloInsumoId, modeloId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    modelo_id: modeloId,
    nome: rest.nome,
    unidade_compra: rest.unidadeCompra || null,
    quantidade_por_compra: rest.quantidadePorCompra,
    valor_compra: rest.valorCompra,
    observacoes: rest.observacoes || null,
  };

  const { error } = modeloInsumoId
    ? await supabase.from("precificacao_modelo_insumos").update(payload).eq("id", modeloInsumoId)
    : await supabase.from("precificacao_modelo_insumos").insert(payload);

  if (error) return { error: "Não foi possível salvar o insumo." };

  revalidatePath(ADMIN_BASE, "layout");
  redirect(`${ADMIN_BASE}/${modeloId}/insumos`);
}

export async function deleteModeloInsumo(modeloId: string, modeloInsumoId: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("precificacao_modelo_insumos").delete().eq("id", modeloInsumoId);
  revalidatePath(ADMIN_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Procedimentos do modelo (sem receita nesta versão — ver comentário na migration)
// ---------------------------------------------------------------------------

const modeloProcedimentoSchema = z.object({
  modeloProcedimentoId: uuidLike.optional(),
  modeloId: uuidLike,
  nome: z.string().trim().min(2, "Informe o nome do procedimento."),
  especialidade: z.string().trim().optional(),
  tempoAtendimentoHoras: z.string().transform(numeroBr).pipe(z.number().min(0)),
  precoVenda: z.string().transform(numeroBr).pipe(z.number().min(0)),
  custoLaboratorio: z.string().transform(numeroBr).pipe(z.number().min(0)),
  honorarioProfissionalFixo: z.string().transform(numeroBr).pipe(z.number().min(0)),
  percentualRetrabalho: z.string().transform(percentualParaFracao).pipe(z.number().min(0).max(1)),
  ativo: z.coerce.boolean(),
});

export async function saveModeloProcedimento(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireSomaStaff();
  const parsed = modeloProcedimentoSchema.safeParse({
    modeloProcedimentoId: formData.get("modeloProcedimentoId") || undefined,
    modeloId: formData.get("modeloId"),
    nome: formData.get("nome"),
    especialidade: formData.get("especialidade") || undefined,
    tempoAtendimentoHoras: formData.get("tempoAtendimentoHoras"),
    precoVenda: formData.get("precoVenda"),
    custoLaboratorio: formData.get("custoLaboratorio"),
    honorarioProfissionalFixo: formData.get("honorarioProfissionalFixo"),
    percentualRetrabalho: formData.get("percentualRetrabalho"),
    ativo: formData.get("ativo") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { modeloProcedimentoId, modeloId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    modelo_id: modeloId,
    nome: rest.nome,
    especialidade: rest.especialidade || null,
    tempo_atendimento_horas: rest.tempoAtendimentoHoras,
    preco_venda: rest.precoVenda,
    custo_laboratorio: rest.custoLaboratorio,
    honorario_profissional_fixo: rest.honorarioProfissionalFixo,
    percentual_retrabalho: rest.percentualRetrabalho,
    ativo: rest.ativo,
  };

  const { error } = modeloProcedimentoId
    ? await supabase.from("precificacao_modelo_procedimentos").update(payload).eq("id", modeloProcedimentoId)
    : await supabase.from("precificacao_modelo_procedimentos").insert(payload);

  if (error) return { error: "Não foi possível salvar o procedimento." };

  revalidatePath(ADMIN_BASE, "layout");
  redirect(`${ADMIN_BASE}/${modeloId}/procedimentos`);
}

export async function deleteModeloProcedimento(modeloId: string, modeloProcedimentoId: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("precificacao_modelo_procedimentos").delete().eq("id", modeloProcedimentoId);
  revalidatePath(ADMIN_BASE, "layout");
}

// ---------------------------------------------------------------------------
// Importar modelo pro catálogo de uma empresa — cópia editável, não fica
// linkado ao modelo depois. Acessível a staff OU cliente da empresa (mesma
// guarda usada em todo o resto do módulo de precificação).
// ---------------------------------------------------------------------------

export async function importarModelo(companyId: string, modeloId: string, basePath: string) {
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();

  const [{ data: modeloInsumos }, { data: modeloProcedimentos }] = await Promise.all([
    supabase
      .from("precificacao_modelo_insumos")
      .select("id, nome, unidade_compra, quantidade_por_compra, valor_compra, observacoes")
      .eq("modelo_id", modeloId),
    supabase
      .from("precificacao_modelo_procedimentos")
      .select(
        "id, nome, especialidade, tempo_atendimento_horas, preco_venda, custo_laboratorio, honorario_profissional_fixo, percentual_retrabalho, ativo",
      )
      .eq("modelo_id", modeloId),
  ]);

  // Mapeia id do item-modelo -> id do novo insumo/procedimento da empresa,
  // pra poder recriar a receita (quando o modelo tiver uma) com as
  // referências corretas.
  const insumoIdMap = new Map<string, string>();
  if (modeloInsumos && modeloInsumos.length > 0) {
    const { data: novosInsumos, error } = await supabase
      .from("precificacao_insumos")
      .insert(
        modeloInsumos.map((i) => ({
          company_id: companyId,
          nome: i.nome,
          unidade_compra: i.unidade_compra,
          quantidade_por_compra: i.quantidade_por_compra,
          valor_compra: i.valor_compra,
          observacoes: i.observacoes,
        })),
      )
      .select("id");
    if (error || !novosInsumos) throw new Error("Não foi possível importar os insumos do modelo.");
    modeloInsumos.forEach((original, idx) => insumoIdMap.set(original.id, novosInsumos[idx].id));
  }

  const procedimentoIdMap = new Map<string, string>();
  if (modeloProcedimentos && modeloProcedimentos.length > 0) {
    const { data: novosProcedimentos, error } = await supabase
      .from("precificacao_procedimentos")
      .insert(
        modeloProcedimentos.map((p) => ({
          company_id: companyId,
          nome: p.nome,
          especialidade: p.especialidade,
          tempo_atendimento_horas: p.tempo_atendimento_horas,
          preco_venda: p.preco_venda,
          custo_laboratorio: p.custo_laboratorio,
          honorario_profissional_fixo: p.honorario_profissional_fixo,
          percentual_retrabalho: p.percentual_retrabalho,
          ativo: p.ativo,
        })),
      )
      .select("id");
    if (error || !novosProcedimentos) throw new Error("Não foi possível importar os procedimentos do modelo.");
    modeloProcedimentos.forEach((original, idx) => procedimentoIdMap.set(original.id, novosProcedimentos[idx].id));
  }

  // Receita: só roda se o modelo tiver alguma (o SOMA Odontologia inicial
  // não tem — ver comentário na migration).
  if (procedimentoIdMap.size > 0) {
    const { data: modeloReceita } = await supabase
      .from("precificacao_modelo_procedimento_insumos")
      .select("modelo_procedimento_id, modelo_insumo_id, quantidade")
      .in("modelo_procedimento_id", [...procedimentoIdMap.keys()]);

    if (modeloReceita && modeloReceita.length > 0) {
      await supabase.from("precificacao_procedimento_insumos").insert(
        modeloReceita
          .filter((r) => procedimentoIdMap.has(r.modelo_procedimento_id) && insumoIdMap.has(r.modelo_insumo_id))
          .map((r) => ({
            procedimento_id: procedimentoIdMap.get(r.modelo_procedimento_id)!,
            insumo_id: insumoIdMap.get(r.modelo_insumo_id)!,
            quantidade: r.quantidade,
          })),
      );
    }
  }

  await logAudit({
    companyId,
    action: "IMPORT",
    entity: "precificacao_modelo",
    entityId: modeloId,
    newValue: { insumos: insumoIdMap.size, procedimentos: procedimentoIdMap.size },
  });

  revalidatePath(`/admin/empresas/${companyId}/precificacao`, "layout");
  revalidatePath(`/empresas/${companyId}/precificacao`, "layout");
  redirect(basePath);
}
