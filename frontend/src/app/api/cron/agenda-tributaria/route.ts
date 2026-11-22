import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { mesCorrenteBrasilia, proximaCompetencia } from "@/lib/competencia";
import { buscarAgendaOficial, gravarAgenda } from "@/lib/agenda-tributaria";

export const maxDuration = 120;

/**
 * Todo dia: importa a Agenda Tributária oficial do mês corrente e do
 * seguinte se ainda não estiverem no banco. A Receita publica o mês seguinte
 * por volta do dia 23–28 (ADE Corat); até lá o mês aparece como "não
 * publicado" e a rotina tenta de novo no dia seguinte. Mês já importado não
 * é baixado de novo (correção de ADE: botão "Reimportar" na Visão geral).
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const atual = mesCorrenteBrasilia();
  const meses = [atual, proximaCompetencia(atual)];
  const { data: existentes, error } = await admin
    .from("agenda_tributaria_meses")
    .select("mes")
    .in("mes", meses.map((m) => `${m}-01`));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const ja = new Set((existentes ?? []).map((r) => String(r.mes).slice(0, 7)));

  const resultado: Record<string, string> = {};
  let mudou = false;
  for (const mes of meses) {
    if (ja.has(mes)) {
      resultado[mes] = "já importado";
      continue;
    }
    try {
      const agenda = await buscarAgendaOficial(mes);
      if (!agenda) {
        resultado[mes] = "não publicado";
        continue;
      }
      const n = await gravarAgenda(admin, agenda);
      resultado[mes] = `${n} itens (${agenda.origem}, ${agenda.ade ?? "sem ADE"})`;
      mudou = true;
    } catch (e) {
      resultado[mes] = `erro: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[agenda-tributaria]", mes, e);
    }
  }
  if (mudou) revalidatePath("/admin");
  return NextResponse.json(resultado);
}
