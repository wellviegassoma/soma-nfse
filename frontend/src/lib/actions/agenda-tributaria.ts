"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireSuperAdmin } from "@/lib/auth";
import { buscarAgendaOficial, gravarAgenda, lerPlanilhaAgenda } from "@/lib/agenda-tributaria";

export type AgendaActionState = { ok?: string; error?: string } | null;

const MES_REGEX = /^\d{4}-\d{2}$/;

/** Botão "Reimportar": busca de novo a agenda oficial do mês no gov.br. */
export async function reimportarAgendaAction(_prev: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  await requireSomaStaff();
  const mes = String(formData.get("mes") ?? "");
  if (!MES_REGEX.test(mes)) return { error: "Mês inválido." };
  try {
    const agenda = await buscarAgendaOficial(mes);
    if (!agenda) return { error: "A Receita ainda não publicou a agenda desse mês." };
    const n = await gravarAgenda(await createClient(), agenda);
    revalidatePath("/admin");
    return { ok: `${n} obrigações importadas (${agenda.ade ?? agenda.origem}).` };
  } catch (e) {
    return { error: `Falha ao importar: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Envio manual da planilha anexa ao ADE Corat (site fora do ar, retificação). */
export async function enviarPlanilhaAgendaAction(_prev: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  await requireSomaStaff();
  const mes = String(formData.get("mes") ?? "");
  const arquivo = formData.get("arquivo");
  if (!MES_REGEX.test(mes)) return { error: "Mês inválido." };
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Selecione a planilha .xlsx da agenda." };
  try {
    const itens = await lerPlanilhaAgenda(Buffer.from(await arquivo.arrayBuffer()), mes);
    const n = await gravarAgenda(await createClient(), {
      mes,
      ade: arquivo.name.replace(/\.xlsx?$/i, ""),
      fonteUrl: arquivo.name,
      origem: "UPLOAD",
      itens,
    });
    revalidatePath("/admin");
    return { ok: `${n} obrigações importadas da planilha.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type MetaInput = {
  chave: string;
  tipo: "TRIBUTO" | "DECLARACAO";
  codigo: string | null;
  grupo: string | null;
  descricao: string;
  diaMeta: number | null; // null = remover a meta
  observacao: string | null;
};

/** Configurações › Metas da agenda: grava (ou remove) a meta SOMA de uma obrigação. */
export async function salvarMetaAgendaAction(input: MetaInput): Promise<{ ok: true } | { error: string }> {
  await requireSuperAdmin();
  const supabase = await createClient();
  if (input.diaMeta == null) {
    const { error } = await supabase.from("agenda_tributaria_metas").delete().eq("chave", input.chave);
    if (error) return { error: error.message };
  } else {
    if (!Number.isInteger(input.diaMeta) || input.diaMeta < 1 || input.diaMeta > 31) {
      return { error: "O dia da meta deve ser de 1 a 31." };
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("agenda_tributaria_metas").upsert({
      chave: input.chave,
      tipo: input.tipo,
      codigo: input.codigo,
      grupo: input.grupo,
      descricao: input.descricao,
      dia_meta: input.diaMeta,
      observacao: input.observacao?.trim() || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id ?? null,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/admin");
  revalidatePath("/admin/configuracoes/agenda-metas");
  return { ok: true };
}
