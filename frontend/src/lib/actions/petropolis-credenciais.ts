"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { encryptSecret, toBytea } from "@/lib/certificate";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type PetropolisCredencialState = { error?: string; success?: boolean } | undefined;

const salvarSchema = z.object({
  companyId: uuidLike,
  login: z.string().trim().min(1, "Informe o login (geralmente o CNPJ da empresa)."),
  senha: z.string().trim().min(1, "Informe a senha."),
});

export async function salvarCredencialPetropolis(
  _prevState: PetropolisCredencialState,
  formData: FormData,
): Promise<PetropolisCredencialState> {
  await requireSomaStaff();

  const parsed = salvarSchema.safeParse({
    companyId: formData.get("companyId"),
    login: formData.get("login"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, login, senha } = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from("petropolis_credenciais").upsert({
    company_id: companyId,
    login,
    encrypted_senha: toBytea(encryptSecret(Buffer.from(senha, "utf8"))),
    created_by: user.id,
  });
  if (error) return { error: "Não foi possível salvar a credencial." };

  // Nunca logar a senha em si.
  await logAudit({
    companyId,
    action: "UPDATE",
    entity: "petropolis_credenciais",
    entityId: companyId,
    newValue: { login },
  });

  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  return { success: true };
}

export async function apagarCredencialPetropolis(companyId: string) {
  await requireSomaStaff();
  const supabase = await createClient();

  const { error } = await supabase.from("petropolis_credenciais").delete().eq("company_id", companyId);
  if (error) return;

  await logAudit({
    companyId,
    action: "DELETE",
    entity: "petropolis_credenciais",
    entityId: companyId,
  });
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
}
