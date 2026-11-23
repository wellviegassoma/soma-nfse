"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";

/** Vínculo manual de um processo do SEI a um cliente (nunca sobrescrito pela sincronização). */
export async function vincularProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const companyIdBruto = String(formData.get("companyId") ?? "");
  const companyId = companyIdBruto ? z.string().uuid().parse(companyIdBruto) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sei_processos")
    .update({
      company_id: companyId,
      // Desvincular volta para o automático na próxima sincronização.
      vinculo_origem: companyId ? "MANUAL" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei");
  revalidatePath(`/legalizacao/sei/${processoId}`);
}

/** Tira o selo "novidade" do processo. */
export async function marcarSeiVisto(formData: FormData) {
  await requirePermissao("legalizacao.ver");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_processos")
    .update({ visto_em: new Date().toISOString(), visto_por: user.user?.id ?? null })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei");
  revalidatePath(`/legalizacao/sei/${processoId}`);
}
