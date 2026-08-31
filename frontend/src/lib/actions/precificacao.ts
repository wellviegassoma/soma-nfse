"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";

// Campo em branco vira 0, não erro — todo campo que usa isso é opcional
// (custo de laboratório, honorário fixo, retrabalho etc. valem 0 quando não
// preenchidos). Campos realmente obrigatórios (nome, preço) têm sua própria
// validação e o atributo `required` no HTML.
const numeroBr = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : 0;

// Campos de alíquota/taxa/desconto/retrabalho são digitados em % (0-100) nos
// formulários, mas guardados como fração (0-1) no banco — mesma unidade
// usada pelo motor de cálculo (engine.ts).
const percentualParaFracao = (v: unknown) => {
  const n = numeroBr(v);
  return n === undefined ? undefined : n / 100;
};

function revalidarPrecificacao(companyId: string) {
  revalidatePath(`/admin/empresas/${companyId}/precificacao`, "layout");
  revalidatePath(`/empresas/${companyId}/precificacao`, "layout");
}

// Toda action recebe basePath (ex. "/admin/empresas/x/precificacao" ou
// "/empresas/x/precificacao") pra redirecionar de volta pro mesmo lado
// (staff ou cliente) de onde o formulário foi enviado — as duas árvores
// compartilham as mesmas actions e o mesmo catálogo.

// ---------------------------------------------------------------------------
// Parâmetros (1 linha por empresa)
// ---------------------------------------------------------------------------

const parametrosSchema = z.object({
  companyId: uuidLike,
  basePath: z.string().trim().min(1),
  cargaHorariaMensal: z.string().transform(numeroBr).pipe(z.number().min(0)),
  aliquotaImposto: z.string().transform(percentualParaFracao).pipe(z.number().min(0).max(1)),
  taxaCartao: z.string().transform(percentualParaFracao).pipe(z.number().min(0).max(1)),
  descontoPadrao: z.string().transform(percentualParaFracao).pipe(z.number().min(0).max(1)),
});

export async function saveParametros(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = parametrosSchema.safeParse({
    companyId: formData.get("companyId"),
    basePath: formData.get("basePath"),
    cargaHorariaMensal: formData.get("cargaHorariaMensal"),
    aliquotaImposto: formData.get("aliquotaImposto"),
    taxaCartao: formData.get("taxaCartao"),
    descontoPadrao: formData.get("descontoPadrao"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, basePath, ...rest } = parsed.data;
  await requirePrecificacaoAccess(companyId);

  const supabase = await createClient();
  const payload = {
    company_id: companyId,
    carga_horaria_mensal: rest.cargaHorariaMensal,
    aliquota_imposto: rest.aliquotaImposto,
    taxa_cartao: rest.taxaCartao,
    desconto_padrao: rest.descontoPadrao,
  };

  const { error } = await supabase
    .from("precificacao_parametros")
    .upsert(payload, { onConflict: "company_id" });

  if (error) return { error: "Não foi possível salvar os parâmetros." };

  await logAudit({ companyId, action: "UPSERT", entity: "precificacao_parametros", newValue: payload });
  revalidarPrecificacao(companyId);
  redirect(`${basePath}/parametros`);
}

// ---------------------------------------------------------------------------
// Custos fixos
// ---------------------------------------------------------------------------

const custoFixoSchema = z.object({
  custoFixoId: uuidLike.optional(),
  companyId: uuidLike,
  basePath: z.string().trim().min(1),
  descricao: z.string().trim().min(2, "Informe a descrição do custo."),
  valorMensal: z.string().transform(numeroBr).pipe(z.number().min(0)),
  ativo: z.coerce.boolean(),
});

export async function saveCustoFixo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = custoFixoSchema.safeParse({
    custoFixoId: formData.get("custoFixoId") || undefined,
    companyId: formData.get("companyId"),
    basePath: formData.get("basePath"),
    descricao: formData.get("descricao"),
    valorMensal: formData.get("valorMensal"),
    ativo: formData.get("ativo") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { custoFixoId, companyId, basePath, descricao, valorMensal, ativo } = parsed.data;
  await requirePrecificacaoAccess(companyId);

  const supabase = await createClient();
  const payload = { company_id: companyId, descricao, valor_mensal: valorMensal, ativo };

  const { error } = custoFixoId
    ? await supabase.from("precificacao_custos_fixos").update(payload).eq("id", custoFixoId)
    : await supabase.from("precificacao_custos_fixos").insert(payload);

  if (error) return { error: "Não foi possível salvar o custo fixo." };

  await logAudit({
    companyId,
    action: custoFixoId ? "UPDATE" : "CREATE",
    entity: "precificacao_custo_fixo",
    entityId: custoFixoId,
    newValue: payload,
  });
  revalidarPrecificacao(companyId);
  redirect(`${basePath}/parametros`);
}

export async function deleteCustoFixo(companyId: string, custoFixoId: string) {
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  await supabase.from("precificacao_custos_fixos").delete().eq("id", custoFixoId);
  await logAudit({ companyId, action: "DELETE", entity: "precificacao_custo_fixo", entityId: custoFixoId });
  revalidarPrecificacao(companyId);
}

// ---------------------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------------------

const insumoSchema = z.object({
  insumoId: uuidLike.optional(),
  companyId: uuidLike,
  basePath: z.string().trim().min(1),
  nome: z.string().trim().min(2, "Informe o nome do insumo."),
  unidadeCompra: z.string().trim().optional(),
  quantidadePorCompra: z.string().transform(numeroBr).pipe(z.number().positive("Quantidade por compra deve ser maior que zero.")),
  valorCompra: z.string().transform(numeroBr).pipe(z.number().min(0)),
  observacoes: z.string().trim().optional(),
});

export async function saveInsumo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = insumoSchema.safeParse({
    insumoId: formData.get("insumoId") || undefined,
    companyId: formData.get("companyId"),
    basePath: formData.get("basePath"),
    nome: formData.get("nome"),
    unidadeCompra: formData.get("unidadeCompra") || undefined,
    quantidadePorCompra: formData.get("quantidadePorCompra"),
    valorCompra: formData.get("valorCompra"),
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { insumoId, companyId, basePath, ...rest } = parsed.data;
  await requirePrecificacaoAccess(companyId);

  const supabase = await createClient();
  const payload = {
    company_id: companyId,
    nome: rest.nome,
    unidade_compra: rest.unidadeCompra || null,
    quantidade_por_compra: rest.quantidadePorCompra,
    valor_compra: rest.valorCompra,
    observacoes: rest.observacoes || null,
  };

  const { error } = insumoId
    ? await supabase.from("precificacao_insumos").update(payload).eq("id", insumoId)
    : await supabase.from("precificacao_insumos").insert(payload);

  if (error) return { error: "Não foi possível salvar o insumo." };

  await logAudit({
    companyId,
    action: insumoId ? "UPDATE" : "CREATE",
    entity: "precificacao_insumo",
    entityId: insumoId,
    newValue: payload,
  });
  revalidarPrecificacao(companyId);
  redirect(`${basePath}/insumos`);
}

export async function deleteInsumo(companyId: string, insumoId: string) {
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  await supabase.from("precificacao_insumos").delete().eq("id", insumoId);
  await logAudit({ companyId, action: "DELETE", entity: "precificacao_insumo", entityId: insumoId });
  revalidarPrecificacao(companyId);
}

// ---------------------------------------------------------------------------
// Procedimentos + receita (BOM)
// ---------------------------------------------------------------------------

const receitaItemSchema = z.object({
  insumoId: uuidLike,
  quantidade: z.number().positive(),
});

const procedimentoSchema = z.object({
  procedimentoId: uuidLike.optional(),
  companyId: uuidLike,
  basePath: z.string().trim().min(1),
  nome: z.string().trim().min(2, "Informe o nome do procedimento."),
  especialidade: z.string().trim().optional(),
  tempoAtendimentoHoras: z.string().transform(numeroBr).pipe(z.number().min(0)),
  precoVenda: z.string().transform(numeroBr).pipe(z.number().min(0)),
  custoLaboratorio: z.string().transform(numeroBr).pipe(z.number().min(0)),
  honorarioProfissionalFixo: z.string().transform(numeroBr).pipe(z.number().min(0)),
  percentualRetrabalho: z.string().transform(percentualParaFracao).pipe(z.number().min(0).max(1)),
  ativo: z.coerce.boolean(),
  receitaJson: z
    .string()
    .transform((v) => JSON.parse(v))
    .pipe(z.array(receitaItemSchema)),
});

export async function saveProcedimento(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = procedimentoSchema.safeParse({
    procedimentoId: formData.get("procedimentoId") || undefined,
    companyId: formData.get("companyId"),
    basePath: formData.get("basePath"),
    nome: formData.get("nome"),
    especialidade: formData.get("especialidade") || undefined,
    tempoAtendimentoHoras: formData.get("tempoAtendimentoHoras"),
    precoVenda: formData.get("precoVenda"),
    custoLaboratorio: formData.get("custoLaboratorio"),
    honorarioProfissionalFixo: formData.get("honorarioProfissionalFixo"),
    percentualRetrabalho: formData.get("percentualRetrabalho"),
    ativo: formData.get("ativo") === "on",
    receitaJson: formData.get("receitaJson") || "[]",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { procedimentoId, companyId, basePath, receitaJson, ...rest } = parsed.data;
  await requirePrecificacaoAccess(companyId);

  const supabase = await createClient();
  const payload = {
    company_id: companyId,
    nome: rest.nome,
    especialidade: rest.especialidade || null,
    tempo_atendimento_horas: rest.tempoAtendimentoHoras,
    preco_venda: rest.precoVenda,
    custo_laboratorio: rest.custoLaboratorio,
    honorario_profissional_fixo: rest.honorarioProfissionalFixo,
    percentual_retrabalho: rest.percentualRetrabalho,
    ativo: rest.ativo,
  };

  const { data: saved, error } = procedimentoId
    ? await supabase
        .from("precificacao_procedimentos")
        .update(payload)
        .eq("id", procedimentoId)
        .select("id")
        .single()
    : await supabase.from("precificacao_procedimentos").insert(payload).select("id").single();

  if (error || !saved) return { error: "Não foi possível salvar o procedimento." };

  // Receita: mais simples e confiável apagar tudo e reinserir do que fazer
  // diff incremental — volume por procedimento é pequeno (poucas dezenas de
  // insumos no máximo).
  await supabase.from("precificacao_procedimento_insumos").delete().eq("procedimento_id", saved.id);
  if (receitaJson.length > 0) {
    await supabase.from("precificacao_procedimento_insumos").insert(
      receitaJson.map((item) => ({
        procedimento_id: saved.id,
        insumo_id: item.insumoId,
        quantidade: item.quantidade,
      })),
    );
  }

  await logAudit({
    companyId,
    action: procedimentoId ? "UPDATE" : "CREATE",
    entity: "precificacao_procedimento",
    entityId: saved.id,
    newValue: payload,
  });
  revalidarPrecificacao(companyId);
  redirect(`${basePath}/procedimentos/${saved.id}`);
}

export async function deleteProcedimento(companyId: string, procedimentoId: string, basePath: string) {
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  await supabase.from("precificacao_procedimentos").delete().eq("id", procedimentoId);
  await logAudit({ companyId, action: "DELETE", entity: "precificacao_procedimento", entityId: procedimentoId });
  revalidarPrecificacao(companyId);
  redirect(basePath);
}
