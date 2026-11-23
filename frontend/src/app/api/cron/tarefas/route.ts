import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { competenciasSemPrazo, gerarTarefas } from "@/lib/tarefas";

export const maxDuration = 120;

/**
 * Todo dia (depois do cron da agenda tributária): cria as tarefas da
 * competência que acabou de fechar (mês anterior) que ainda não existem —
 * rodar todo dia faz empresa nova e modelo novo entrarem sozinhos — e
 * preenche/atualiza prazo das tarefas abertas cuja agenda saiu depois.
 * Só modelos ATIVOS geram (Configurações › Modelos de tarefa).
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const competencia = mesAnteriorBrasilia();
  try {
    const principal = await gerarTarefas(admin, competencia);
    const prazos = [];
    for (const c of await competenciasSemPrazo(admin)) {
      if (c !== competencia) prazos.push(await gerarTarefas(admin, c, { criar: false }));
    }
    if (principal.criadas || principal.prazosAtualizados || prazos.some((p) => p.prazosAtualizados)) {
      revalidatePath("/admin/tarefas", "layout");
    }
    return NextResponse.json({ principal, prazos });
  } catch (e) {
    console.error("[tarefas]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
