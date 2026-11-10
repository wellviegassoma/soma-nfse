"use server";

import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export type SalvarConferenciaIssResultado =
  | { ok: true; conferidoEm: string; conferidoPor: string | null }
  | { ok: false; erro: string };

// Guarda o resultado de uma conferência das Centrais ISS (Rio/Petrópolis).
// A assinatura vem da própria tela — é o retrato do faturamento que a
// conferência comparou; se o faturamento mudou depois, a próxima abertura
// da central vê a diferença e pede reprocessamento.
export async function salvarConferenciaIss(params: {
  companyId: string;
  competencia: string;
  municipio: "rio" | "petropolis";
  status: string;
  mensagem: string | null;
  dados: Record<string, unknown>;
  assinaturaSoma: string;
  faturamentoSoma: number | null;
  issSoma: number | null;
}): Promise<SalvarConferenciaIssResultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA_REGEX.test(params.competencia)) return { ok: false, erro: "Competência inválida." };
  if (params.municipio !== "rio" && params.municipio !== "petropolis") return { ok: false, erro: "Município inválido." };

  const supabase = await createClient();
  const conferidoEm = new Date().toISOString();
  const { error } = await supabase.from("iss_conferencias").upsert(
    {
      company_id: params.companyId,
      competencia: params.competencia,
      municipio: params.municipio,
      status: params.status,
      mensagem: params.mensagem,
      dados: params.dados,
      assinatura_soma: params.assinaturaSoma,
      faturamento_soma: params.faturamentoSoma,
      iss_soma: params.issSoma,
      conferido_em: conferidoEm,
      conferido_por: user.id,
    },
    { onConflict: "company_id,competencia" },
  );
  if (error) return { ok: false, erro: error.message };

  const { data: perfil } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  return { ok: true, conferidoEm, conferidoPor: (perfil?.full_name as string | null) ?? null };
}
