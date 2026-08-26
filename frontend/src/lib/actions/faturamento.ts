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
