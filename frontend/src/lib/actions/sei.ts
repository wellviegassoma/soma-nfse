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

/** Arquiva: some das listas e a extensão deixa de abrir o processo no SEI. */
export async function arquivarProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const motivo = z.string().trim().min(1).max(200).parse(formData.get("motivo"));
  const obs = String(formData.get("observacao") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_processos")
    .update({
      arquivado_em: new Date().toISOString(),
      arquivado_por: user.user?.id ?? null,
      motivo_arquivamento: obs ? `${motivo} — ${obs}` : motivo,
    })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

export async function desarquivarProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("sei_processos")
    .update({ arquivado_em: null, arquivado_por: null, motivo_arquivamento: null })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

const MOTIVOS_DISPENSA = ["PONTO_REFERENCIA", "SEM_ATENDIMENTO_LOCAL", "ATIVIDADE_DISPENSADA", "PROCESSO_FORA_SEI", "OUTRO"] as const;

/** Cliente de Petrópolis conferido: não precisa de processo no SEI. */
export async function dispensarClienteSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const motivo = z.enum(MOTIVOS_DISPENSA).parse(formData.get("motivo"));
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  if (motivo === "OUTRO" && !observacao) throw new Error("Explique o motivo na observação.");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_cobertura_dispensas")
    .upsert({ company_id: companyId, motivo, observacao, criado_por: user.user?.id ?? null, created_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

export async function desfazerDispensaSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const supabase = await createClient();
  const { error } = await supabase.from("sei_cobertura_dispensas").delete().eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
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
