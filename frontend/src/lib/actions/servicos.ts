"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";

const serviceSchema = z.object({
  serviceId: uuidLike.optional(),
  companyId: uuidLike,
  name: z.string().trim().min(2, "Informe o nome exibido ao cliente."),
  description: z.string().trim().optional(),
  nationalTaxCode: z.string().trim().optional(),
  municipalTaxCode: z.string().trim().optional(),
  nbs: z.string().trim().optional(),
  issRate: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  taxationType: z.string().trim().optional(),
  active: z.coerce.boolean(),
});

export async function saveService(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = serviceSchema.safeParse({
    serviceId: formData.get("serviceId") || undefined,
    companyId: formData.get("companyId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    nationalTaxCode: formData.get("nationalTaxCode") || undefined,
    municipalTaxCode: formData.get("municipalTaxCode") || undefined,
    nbs: formData.get("nbs") || undefined,
    issRate: formData.get("issRate") || undefined,
    taxationType: formData.get("taxationType") || undefined,
    active: formData.get("active") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { serviceId, companyId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    company_id: companyId,
    name: rest.name,
    description: rest.description || null,
    national_tax_code: rest.nationalTaxCode || null,
    municipal_tax_code: rest.municipalTaxCode || null,
    nbs: rest.nbs || null,
    iss_rate: rest.issRate ?? null,
    taxation_type: rest.taxationType || null,
    active: rest.active,
  };

  const { data: saved, error } = serviceId
    ? await supabase.from("services").update(payload).eq("id", serviceId).select("id").single()
    : await supabase.from("services").insert(payload).select("id").single();

  if (error) return { error: "Não foi possível salvar o serviço." };

  await logAudit({
    companyId,
    action: serviceId ? "UPDATE" : "CREATE",
    entity: "service",
    entityId: saved?.id ?? serviceId,
    newValue: payload,
  });

  revalidatePath(`/admin/empresas/${companyId}/servicos`);
  redirect(`/admin/empresas/${companyId}/servicos`);
}

export async function toggleServiceActive(
  companyId: string,
  serviceId: string,
  active: boolean,
) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("services").update({ active }).eq("id", serviceId);
  revalidatePath(`/admin/empresas/${companyId}/servicos`);
}
