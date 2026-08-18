"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSomaStaff } from "@/lib/auth";
import type { ActionState } from "@/lib/actions/auth";

const createCompanySchema = z.object({
  organizationName: z.string().trim().min(2, "Informe o nome da empresa/organização."),
  legalName: z.string().trim().min(2, "Informe a razão social."),
  tradeName: z.string().trim().optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
});

export async function createCompany(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = createCompanySchema.safeParse({
    organizationName: formData.get("organizationName"),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
    cnpj: formData.get("cnpj") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: parsed.data.organizationName })
    .select("id")
    .single();
  if (orgError || !org) {
    return { error: "Não foi possível criar a organização." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      organization_id: org.id,
      legal_name: parsed.data.legalName,
      trade_name: parsed.data.tradeName || null,
      cnpj: parsed.data.cnpj || null,
    })
    .select("id")
    .single();
  if (companyError || !company) {
    return {
      error:
        companyError?.code === "23505"
          ? "Já existe uma empresa cadastrada com esse CNPJ."
          : "Não foi possível criar a empresa.",
    };
  }

  revalidatePath("/admin/empresas");
  redirect(`/admin/empresas/${company.id}`);
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  fullName: z.string().trim().min(2, "Informe o nome."),
  role: z.enum(["SUPER_ADMIN", "ADMIN_SOMA", "ADMIN_CLIENTE", "EMISSOR"]),
  companyId: z.string().uuid(),
});

export async function inviteUserToCompany(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    companyId: formData.get("companyId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { email, fullName, role, companyId } = parsed.data;

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
    });

  let userId = invited?.user?.id;

  // Usuário já existe no Auth (ex.: acesso a outra empresa) — busca o id dele.
  if (inviteError) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) {
      return { error: "Não foi possível convidar esse e-mail." };
    }
    userId = existing.id;
  }

  if (!userId) {
    return { error: "Não foi possível identificar o usuário convidado." };
  }

  const supabase = await createClient();
  const { error: linkError } = await supabase
    .from("user_companies")
    .insert({ user_id: userId, company_id: companyId, role });

  if (linkError) {
    return {
      error:
        linkError.code === "23505"
          ? "Esse usuário já tem acesso a essa empresa."
          : "Não foi possível vincular o usuário à empresa.",
    };
  }

  revalidatePath(`/admin/empresas/${companyId}`);
  return { success: true };
}
