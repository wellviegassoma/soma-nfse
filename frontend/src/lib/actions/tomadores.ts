"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getCompanyAccess } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";

async function requireCompanyMember(companyId: string) {
  await requireUser();
  const access = await getCompanyAccess(companyId);
  if (!access) throw new Error("Sem acesso a essa empresa.");
}

const customerSchema = z.object({
  customerId: uuidLike.optional(),
  companyId: uuidLike,
  type: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(2, "Informe o nome."),
  cpfCnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  email: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  address: z.string().trim().optional(),
  number: z.string().trim().optional(),
  complement: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
});

export async function saveCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };
  await requireCompanyMember(companyId);

  const parsed = customerSchema.safeParse({
    customerId: formData.get("customerId") || undefined,
    companyId,
    type: formData.get("type"),
    name: formData.get("name"),
    cpfCnpj: formData.get("cpfCnpj") || undefined,
    email: formData.get("email") || undefined,
    zipCode: formData.get("zipCode") || undefined,
    address: formData.get("address") || undefined,
    number: formData.get("number") || undefined,
    complement: formData.get("complement") || undefined,
    district: formData.get("district") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { customerId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    company_id: rest.companyId,
    type: rest.type,
    name: rest.name,
    cpf_cnpj: rest.cpfCnpj || null,
    email: rest.email || null,
    zip_code: rest.zipCode || null,
    address: rest.address || null,
    number: rest.number || null,
    complement: rest.complement || null,
    district: rest.district || null,
    city: rest.city || null,
    state: rest.state || null,
  };

  const { error } = customerId
    ? await supabase.from("customers").update(payload).eq("id", customerId)
    : await supabase.from("customers").insert(payload);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Já existe um tomador com esse CPF/CNPJ."
          : "Não foi possível salvar o tomador.",
    };
  }

  revalidatePath(`/empresas/${rest.companyId}/tomadores`);
  redirect(`/empresas/${rest.companyId}/tomadores`);
}
