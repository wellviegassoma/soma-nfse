"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser, getCompanyAccess, isSomaStaff } from "@/lib/auth";
import { carregarNotasDoMes, type NotaRecente } from "@/lib/emissao-prefill";

/** Notas de uma competência (AAAA-MM) pro painel "Copiar nota" da emissão. */
export async function listarNotasParaCopiarAction(
  companyId: string,
  competencia: string,
): Promise<{ notas: NotaRecente[] } | { error: string }> {
  await requireUser();
  if (!(await isSomaStaff()) && !(await getCompanyAccess(companyId))) {
    return { error: "Sem acesso a essa empresa." };
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competencia)) return { error: "Mês inválido." };
  try {
    const supabase = await createClient();
    return { notas: await carregarNotasDoMes(supabase, companyId, competencia) };
  } catch {
    return { error: "Não foi possível carregar as notas desse mês." };
  }
}
