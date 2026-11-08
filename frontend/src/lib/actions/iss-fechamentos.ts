"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/auth";

type Resultado = { ok: true } | { ok: false; erro: string };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Guia de ISS emitida fora do sistema (direto no site da Prefeitura/Nota
// Carioca). Não sobrescreve uma marcação "sistema" já existente.
export async function marcarIssEmitidaPorFora(
  companyId: string,
  competencia: string,
  observacao: string | null,
): Promise<Resultado> {
  if (!(await temPermissao("fechamento.executar"))) return { ok: false, erro: "Sem permissão." };
  if (!COMPETENCIA_REGEX.test(competencia)) return { ok: false, erro: "Competência inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: existente } = await supabase
    .from("iss_fechamentos")
    .select("origem")
    .eq("company_id", companyId)
    .eq("competencia", competencia)
    .maybeSingle();
  if (existente?.origem === "sistema") {
    return { ok: false, erro: "Essa guia já está marcada como emitida pelo sistema." };
  }

  const { error } = await supabase.from("iss_fechamentos").upsert(
    {
      company_id: companyId,
      competencia,
      origem: "manual",
      valor_guia: null,
      observacao: observacao?.trim() || null,
      marcado_em: new Date().toISOString(),
      marcado_por: user?.id ?? null,
    },
    { onConflict: "company_id,competencia" },
  );
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/admin/fechamento", "layout");
  return { ok: true };
}

// Desfaz só a marcação manual — a do sistema reflete uma guia que saiu daqui.
export async function desmarcarIssEmitidaPorFora(companyId: string, competencia: string): Promise<Resultado> {
  if (!(await temPermissao("fechamento.executar"))) return { ok: false, erro: "Sem permissão." };
  if (!COMPETENCIA_REGEX.test(competencia)) return { ok: false, erro: "Competência inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("iss_fechamentos")
    .delete()
    .eq("company_id", companyId)
    .eq("competencia", competencia)
    .eq("origem", "manual");
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/admin/fechamento", "layout");
  return { ok: true };
}
