"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireLegalizacaoAccess, requireUser } from "@/lib/auth";
import { encryptSecret, decryptSecret, toBytea, fromBytea } from "@/lib/certificate";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type SenhaCofreActionState = { error?: string; success?: boolean } | undefined;

function pathsFor(companyId: string) {
  return [`/admin/empresas/${companyId}/cofre-senhas`, `/legalizacao/empresas/${companyId}/cofre-senhas`];
}

const salvarSenhaSchema = z.object({
  senhaId: uuidLike.optional(),
  companyId: uuidLike,
  servico: z.string().trim().min(2, "Informe o serviço (ex.: gov.br, ISS...)."),
  usuario: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  senha: z.string().trim().optional(),
  observacoes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export async function salvarSenhaCofre(
  _prevState: SenhaCofreActionState,
  formData: FormData,
): Promise<SenhaCofreActionState> {
  await requireSomaStaff();

  const parsed = salvarSenhaSchema.safeParse({
    senhaId: formData.get("senhaId") || undefined,
    companyId: formData.get("companyId"),
    servico: formData.get("servico"),
    usuario: formData.get("usuario") || undefined,
    senha: formData.get("senha") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { senhaId, companyId, servico, usuario, senha, observacoes } = parsed.data;

  if (!senhaId && !senha) {
    return { error: "Informe a senha." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    company_id: companyId,
    servico,
    usuario: usuario ?? null,
    observacoes: observacoes ?? null,
  };
  if (senha) {
    payload.senha_cifrada = toBytea(encryptSecret(Buffer.from(senha, "utf8")));
  }
  if (!senhaId) {
    payload.created_by = user.id;
  }

  const { data: saved, error } = senhaId
    ? await supabase.from("senhas_cofre").update(payload).eq("id", senhaId).select("id").single()
    : await supabase.from("senhas_cofre").insert(payload).select("id").single();

  if (error) return { error: "Não foi possível salvar a senha." };

  // Nunca logar a senha em si — só que uma credencial foi criada/editada.
  await logAudit({
    companyId,
    action: senhaId ? "UPDATE" : "CREATE",
    entity: "senha_cofre",
    entityId: saved?.id ?? senhaId,
    newValue: { servico, usuario: usuario ?? null },
  });

  for (const path of pathsFor(companyId)) revalidatePath(path);
  return { success: true };
}

export async function apagarSenhaCofre(senhaId: string, companyId: string) {
  await requireSomaStaff();
  const supabase = await createClient();

  const { error } = await supabase.from("senhas_cofre").delete().eq("id", senhaId);
  if (error) return;

  await logAudit({ companyId, action: "DELETE", entity: "senha_cofre", entityId: senhaId });
  for (const path of pathsFor(companyId)) revalidatePath(path);
}

export async function revelarSenhaCofre(
  senhaId: string,
  companyId: string,
): Promise<{ senha?: string; error?: string }> {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const { data: registro, error } = await supabase
    .from("senhas_cofre")
    .select("servico, senha_cifrada")
    .eq("id", senhaId)
    .single();
  if (error || !registro) return { error: "Não foi possível carregar a senha." };

  let senha: string;
  try {
    senha = decryptSecret(fromBytea(registro.senha_cifrada)).toString("utf8");
  } catch {
    return { error: "Não foi possível decifrar a senha." };
  }

  // Toda revelação fica registrada — dado real de acesso de terceiro.
  await logAudit({
    companyId,
    action: "REVEAL",
    entity: "senha_cofre",
    entityId: senhaId,
    newValue: { servico: registro.servico },
  });

  return { senha };
}
