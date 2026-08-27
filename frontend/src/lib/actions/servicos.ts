"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { ActionState } from "@/lib/actions/auth";
import { ATIVIDADES_SIMPLES_NACIONAL } from "@/lib/simples-nacional-atividades";

const idsAtividadeValidos = new Set(ATIVIDADES_SIMPLES_NACIONAL.map((a) => a.id));

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
  percFederal: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  percEstadual: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  percMunicipal: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  cstPisCofins: z.string().trim().optional(),
  aliquotaPis: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  aliquotaCofins: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  retencaoIrrfAliquota: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  retencaoPisCofinsCsllAliquota: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  tipoRetencaoIssqn: z.coerce.number().int().min(1).max(3),
  active: z.coerce.boolean(),
  atividadeSimplesNacional: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || idsAtividadeValidos.has(v), "Atividade do Simples Nacional inválida."),
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
    percFederal: formData.get("percFederal") || undefined,
    percEstadual: formData.get("percEstadual") || undefined,
    percMunicipal: formData.get("percMunicipal") || undefined,
    cstPisCofins: formData.get("cstPisCofins") || undefined,
    aliquotaPis: formData.get("aliquotaPis") || undefined,
    aliquotaCofins: formData.get("aliquotaCofins") || undefined,
    retencaoIrrfAliquota: formData.get("retencaoIrrfAliquota") || undefined,
    retencaoPisCofinsCsllAliquota: formData.get("retencaoPisCofinsCsllAliquota") || undefined,
    tipoRetencaoIssqn: formData.get("tipoRetencaoIssqn"),
    active: formData.get("active") === "on",
    atividadeSimplesNacional: formData.get("atividadeSimplesNacional") || undefined,
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
    percentual_total_tributos_federal: rest.percFederal ?? null,
    percentual_total_tributos_estadual: rest.percEstadual ?? null,
    percentual_total_tributos_municipal: rest.percMunicipal ?? null,
    cst_pis_cofins: rest.cstPisCofins || null,
    aliquota_pis: rest.aliquotaPis ?? null,
    aliquota_cofins: rest.aliquotaCofins ?? null,
    retencao_irrf_aliquota: rest.retencaoIrrfAliquota ?? null,
    retencao_pis_cofins_csll_aliquota: rest.retencaoPisCofinsCsllAliquota ?? null,
    tipo_retencao_issqn: rest.tipoRetencaoIssqn,
    active: rest.active,
    atividade_simples_nacional: rest.atividadeSimplesNacional || null,
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
