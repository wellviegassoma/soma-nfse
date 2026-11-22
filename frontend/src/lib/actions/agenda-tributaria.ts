"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
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
