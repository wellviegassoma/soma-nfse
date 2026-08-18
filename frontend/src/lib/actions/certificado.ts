"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { parseCertificate, encryptSecret, toBytea } from "@/lib/certificate";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";

const uploadSchema = z.object({
  companyId: uuidLike,
  password: z.string().min(1, "Informe a senha do certificado."),
});

export async function uploadCertificate(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Selecione o arquivo do certificado (.pfx ou .p12)." };
  }
  if (file.size > 10 * 1024 * 1024) {
    return { error: "Arquivo muito grande — um certificado A1 costuma ter poucos KB." };
  }

  const parsed = uploadSchema.safeParse({
    companyId: formData.get("companyId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  let info;
  try {
    info = parseCertificate(fileBuffer, parsed.data.password);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Certificado inválido." };
  }

  if (info.expiresAt.getTime() < Date.now()) {
    return {
      error: `Esse certificado já venceu em ${info.expiresAt.toLocaleDateString("pt-BR")}.`,
    };
  }

  let encryptedFile: Buffer, encryptedPassword: Buffer;
  try {
    encryptedFile = encryptSecret(fileBuffer);
    encryptedPassword = encryptSecret(Buffer.from(parsed.data.password, "utf8"));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao proteger o certificado." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("certificates").upsert(
    {
      company_id: parsed.data.companyId,
      encrypted_file: toBytea(encryptedFile),
      encrypted_password: toBytea(encryptedPassword),
      fingerprint: info.fingerprint,
      expires_at: info.expiresAt.toISOString(),
      uploaded_by: user.id,
    },
    { onConflict: "company_id" },
  );

  if (error) return { error: "Não foi possível salvar o certificado." };

  // Nunca logar o arquivo/senha — só metadados não sensíveis.
  await logAudit({
    companyId: parsed.data.companyId,
    action: "UPLOAD",
    entity: "certificate",
    newValue: { fingerprint: info.fingerprint, expires_at: info.expiresAt.toISOString() },
  });

  revalidatePath(`/admin/empresas/${parsed.data.companyId}/certificado`);
  return { success: true };
}

export async function deleteCertificate(companyId: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("certificates").delete().eq("company_id", companyId);
  await logAudit({ companyId, action: "DELETE", entity: "certificate" });
  revalidatePath(`/admin/empresas/${companyId}/certificado`);
}
