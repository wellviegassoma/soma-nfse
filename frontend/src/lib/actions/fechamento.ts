"use server";

import { revalidatePath } from "next/cache";
import { requireSomaStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOneCompany, syncAllCompanies, type ResultadoSincronizacao } from "@/lib/sync-notas";

export type BuscarAgoraState = { resultado?: ResultadoSincronizacao; error?: string } | undefined;

export async function buscarAgora(
  _prevState: BuscarAgoraState,
  formData: FormData,
): Promise<BuscarAgoraState> {
  await requireSomaStaff();
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select(
      "id, cnpj, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  const resultado = await syncOneCompany(admin, company);
  revalidatePath(`/admin/empresas/${companyId}/fechamento`);
  return { resultado };
}

export type BuscarTodasState =
  | { resultados?: ResultadoSincronizacao[]; error?: string }
  | undefined;

export async function buscarTodasAgora(
  _prevState: BuscarTodasState,
): Promise<BuscarTodasState> {
  await requireSomaStaff();
  const resultados = await syncAllCompanies(createAdminClient());
  revalidatePath("/admin/fechamento");
  return { resultados };
}
