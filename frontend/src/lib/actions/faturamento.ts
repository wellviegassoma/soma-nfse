"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";

const salvarReceitaManualSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  valor: z
    .string()
    .min(1, "Informe o faturamento do mês.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => !Number.isNaN(v) && v >= 0, "Valor inválido."),
});

export type SalvarReceitaManualState = { error?: string; success?: boolean } | undefined;

export async function salvarReceitaManual(
  _prevState: SalvarReceitaManualState,
  formData: FormData,
): Promise<SalvarReceitaManualState> {
  await requireSomaStaff();

  const parsed = salvarReceitaManualSchema.safeParse({
    companyId: formData.get("companyId"),
    competencia: formData.get("competencia"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, competencia, valor } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("receita_mensal_manual")
    .upsert({ company_id: companyId, competencia, valor }, { onConflict: "company_id,competencia" });

  if (error) return { error: "Não foi possível salvar o faturamento do mês." };

  revalidatePath(`/admin/empresas/${companyId}/rbt12`);
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  return { success: true };
}

const apagarReceitaManualSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
});

export async function apagarReceitaManual(
  _prevState: SalvarReceitaManualState,
  formData: FormData,
): Promise<SalvarReceitaManualState> {
  await requireSomaStaff();

  const parsed = apagarReceitaManualSchema.safeParse({
    companyId: formData.get("companyId"),
    competencia: formData.get("competencia"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, competencia } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("receita_mensal_manual")
    .delete()
    .eq("company_id", companyId)
    .eq("competencia", competencia);

  if (error) return { error: "Não foi possível remover o faturamento do mês." };

  revalidatePath(`/admin/empresas/${companyId}/rbt12`);
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  return { success: true };
}

const linhaReceitaLoteSchema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  valor: z.number().min(0),
});

const salvarReceitaLoteSchema = z.object({
  companyId: uuidLike,
  linhas: z.string().transform((v, ctx) => {
    try {
      return z.array(linhaReceitaLoteSchema).parse(JSON.parse(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "Dados inválidos." });
      return z.NEVER;
    }
  }),
});

export type SalvarReceitaLoteState = { error?: string; success?: boolean; salvos?: number } | undefined;

export async function salvarReceitaManualLote(
  _prevState: SalvarReceitaLoteState,
  formData: FormData,
): Promise<SalvarReceitaLoteState> {
  await requireSomaStaff();

  const parsed = salvarReceitaLoteSchema.safeParse({
    companyId: formData.get("companyId"),
    linhas: formData.get("linhas"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, linhas } = parsed.data;
  if (linhas.length === 0) return { error: "Nenhum mês pra salvar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("receita_mensal_manual")
    .upsert(
      linhas.map((l) => ({ company_id: companyId, competencia: l.competencia, valor: l.valor })),
      { onConflict: "company_id,competencia" },
    );
  if (error) return { error: "Não foi possível salvar o faturamento importado." };

  revalidatePath(`/admin/empresas/${companyId}/rbt12`);
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  return { success: true, salvos: linhas.length };
}
