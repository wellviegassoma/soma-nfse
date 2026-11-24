import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { hojeBrasilia, mesAnteriorBrasilia } from "@/lib/competencia";
import { rodarRotinaSerena } from "@/lib/serena-rotina";

export const maxDuration = 300;

/**
 * Rotina diária da Serena (dias 1 a 25, competência que acabou de fechar):
 * confere Petrópolis e revisa com IA o que está em "Revisar". Nada de
 * transmitir, gerar DAS ou mandar mensagem — isso continua com clique.
 * `?forcar=1` roda fora da janela; `?revisoes=N&conferencias=N` limitam a rodada.
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dia = Number(hojeBrasilia().slice(8, 10));
  const sp = new URL(request.url).searchParams;
  const forcar = sp.get("forcar") === "1";
  if (!forcar && dia > 25) return NextResponse.json({ pulado: "fora da janela (dias 1 a 25)" });
  // etapa=motor: só o motor do sistema (prefeitura), sem IA.
  // etapa=ia: só a auditoria com IA (uma chamada por empresa em "Revisar").
  const etapa = sp.get("etapa") === "motor" ? "motor" : sp.get("etapa") === "ia" ? "ia" : "tudo";
  const limites = {
    conferencias: Math.min(Number(sp.get("conferencias") ?? 30) || 0, 40),
    revisoes: Math.min(Number(sp.get("revisoes") ?? 10) || 0, 12),
  };
  const resumo = await rodarRotinaSerena(createAdminClient(), mesAnteriorBrasilia(), limites, etapa);
  revalidatePath("/admin/serena");
  revalidatePath("/admin/tarefas", "layout");
  return NextResponse.json(resumo);
}
