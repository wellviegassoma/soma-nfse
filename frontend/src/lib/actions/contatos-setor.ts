"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type ContatoSetorActionState = { error?: string; success?: boolean } | undefined;

const contatoSetorSchema = z.object({
  contatoId: uuidLike.optional(),
  companyId: uuidLike,
  setor: z.string().trim().min(2, "Informe o setor."),
  nome: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  telefone: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || z.string().email().safeParse(v).success, "E-mail inválido."),
});

export async function salvarContatoSetor(
  _prevState: ContatoSetorActionState,
  formData: FormData,
): Promise<ContatoSetorActionState> {
  await requireSomaStaff();

  const parsed = contatoSetorSchema.safeParse({
    contatoId: formData.get("contatoId") || undefined,
    companyId: formData.get("companyId"),
    setor: formData.get("setor"),
    nome: formData.get("nome") || undefined,
    telefone: formData.get("telefone") || undefined,
    email: formData.get("email") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { contatoId, companyId, setor, nome, telefone, email } = parsed.data;

  const supabase = await createClient();
  const payload = {
    company_id: companyId,
    setor,
    nome: nome ?? null,
    telefone: telefone ?? null,
    email: email ?? null,
  };

  const { data: saved, error } = contatoId
    ? await supabase.from("company_contatos_setor").update(payload).eq("id", contatoId).select("id").single()
    : await supabase.from("company_contatos_setor").insert(payload).select("id").single();

  if (error) return { error: "Não foi possível salvar o contato." };

  await logAudit({
    companyId,
    action: contatoId ? "UPDATE" : "CREATE",
    entity: "company_contato_setor",
    entityId: saved?.id ?? contatoId,
    newValue: payload,
  });

  revalidatePath(`/admin/empresas/${companyId}/contatos`);
  return { success: true };
}

export async function apagarContatoSetor(contatoId: string, companyId: string) {
  await requireSomaStaff();
  const supabase = await createClient();

  const { error } = await supabase.from("company_contatos_setor").delete().eq("id", contatoId);
  if (error) return;

  await logAudit({ companyId, action: "DELETE", entity: "company_contato_setor", entityId: contatoId });
  revalidatePath(`/admin/empresas/${companyId}/contatos`);
}
