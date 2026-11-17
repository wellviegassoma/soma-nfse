"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/auth";
import { NATUREZAS } from "@/lib/reinf-core";

type Resultado = { ok: true } | { ok: false; erro: string };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;
const STATUS = new Set(["pendente", "enviado", "dispensado"]);

/** Situação da Reinf da empresa no mês (pendente / enviado / dispensado). */
export async function marcarReinf(
  companyId: string,
  competencia: string,
  status: string,
  observacao: string | null,
): Promise<Resultado> {
  if (!(await temPermissao("fechamento.executar"))) return { ok: false, erro: "Sem permissão." };
  if (!COMPETENCIA_REGEX.test(competencia)) return { ok: false, erro: "Competência inválida." };
  if (!STATUS.has(status)) return { ok: false, erro: "Situação inválida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("reinf_fechamentos").upsert(
    {
      company_id: companyId,
      competencia,
      status,
      observacao: observacao?.trim() || null,
      marcado_em: new Date().toISOString(),
      marcado_por: user?.id ?? null,
    },
    { onConflict: "company_id,competencia" },
  );
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/admin/fechamento/reinf");
  return { ok: true };
}

/**
 * Ajuste da equipe numa nota: natureza do rendimento, mês do pagamento
 * (R-4010/R-4020 seguem o pagamento) e "ignorar" (retenção que não houve).
 * Campo ausente = mantém o que já estava.
 */
export async function ajustarNotaReinf(
  notaId: string,
  ajuste: { natureza?: string | null; mesPagamento?: string | null; ignorar?: boolean },
): Promise<Resultado> {
  if (!(await temPermissao("fechamento.executar"))) return { ok: false, erro: "Sem permissão." };
  if (ajuste.natureza != null && !NATUREZAS[ajuste.natureza]) return { ok: false, erro: "Natureza inválida." };
  if (ajuste.mesPagamento != null && !COMPETENCIA_REGEX.test(ajuste.mesPagamento)) {
    return { ok: false, erro: "Mês do pagamento inválido." };
  }

  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("notas_distribuidas")
    .select("id, company_id, direcao")
    .eq("id", notaId)
    .maybeSingle();
  if (!nota || nota.direcao !== "entrada") return { ok: false, erro: "Nota recebida não encontrada." };

  const { data: atual } = await supabase
    .from("reinf_notas_ajustes")
    .select("natureza, mes_pagamento, ignorar")
    .eq("nota_id", notaId)
    .maybeSingle();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("reinf_notas_ajustes").upsert(
    {
      nota_id: notaId,
      company_id: nota.company_id,
      natureza: ajuste.natureza !== undefined ? ajuste.natureza : (atual?.natureza ?? null),
      mes_pagamento: ajuste.mesPagamento !== undefined ? ajuste.mesPagamento : (atual?.mes_pagamento ?? null),
      ignorar: ajuste.ignorar !== undefined ? ajuste.ignorar : (atual?.ignorar ?? false),
      atualizado_em: new Date().toISOString(),
      atualizado_por: user?.id ?? null,
    },
    { onConflict: "nota_id" },
  );
  if (error) return { ok: false, erro: error.message };
  revalidatePath("/admin/fechamento/reinf");
  return { ok: true };
}
