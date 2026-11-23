import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { hojeBrasilia } from "@/lib/competencia";
import { montarAlertas } from "@/lib/tarefas-alertas";
import { emailConfigurado, enviarEmail } from "@/lib/email";

export const maxDuration = 120;

/**
 * Dias úteis às 8h (Brasília): e-mail de alertas de Tarefas para cada
 * responsável + resumo da carteira para quem administra. `?previa=1` só
 * monta e devolve (não envia). Sem SMTP_USER/SMTP_PASS, não envia nada.
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const previa = new URL(request.url).searchParams.get("previa") === "1";
  const emails = await montarAlertas(createAdminClient(), hojeBrasilia());

  if (previa || !emailConfigurado()) {
    return NextResponse.json({
      enviado: false,
      motivo: previa ? "prévia" : "SMTP não configurado (SMTP_USER/SMTP_PASS)",
      emails: emails.map((e) => ({ nome: e.nome, assunto: e.assunto, itens: e.itens })),
      exemploHtml: previa ? emails[0]?.html ?? null : undefined,
    });
  }

  const resultado: { nome: string; ok: boolean; erro?: string }[] = [];
  for (const e of emails) {
    try {
      await enviarEmail(e);
      resultado.push({ nome: e.nome, ok: true });
    } catch (err) {
      console.error("[tarefas-alertas]", e.nome, err);
      resultado.push({ nome: e.nome, ok: false, erro: err instanceof Error ? err.message : String(err) });
    }
  }
  return NextResponse.json({ enviado: true, resultado });
}
