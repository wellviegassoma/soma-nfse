"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";

const salvarFolhaSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  valor: z
    .string()
    .min(1, "Informe o valor da folha.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => !Number.isNaN(v) && v >= 0, "Valor inválido."),
});

export type SalvarFolhaState = { error?: string; success?: boolean } | undefined;

export async function salvarFolhaMensal(
  _prevState: SalvarFolhaState,
  formData: FormData,
): Promise<SalvarFolhaState> {
  await requireSomaStaff();

  const parsed = salvarFolhaSchema.safeParse({
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
    .from("folha_mensal")
    .upsert({ company_id: companyId, competencia, valor }, { onConflict: "company_id,competencia" });

  if (error) return { error: "Não foi possível salvar a folha do mês." };

  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  return { success: true };
}
