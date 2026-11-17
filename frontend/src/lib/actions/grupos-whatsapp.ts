"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { listarGrupos, type DigisacGrupo } from "@/lib/digisac/client";

// "Grupos do WhatsApp" na tela Dados fiscais da empresa: qual(is) grupo(s)
// do Digisac é(são) desta empresa. Alimenta a identificação da empresa no
// pedido de nota (#nota) — ver lib/pedido-nota/empresa.ts e a migration
// fase_bl. Um grupo pode ter várias empresas e vice-versa.

export type GrupoState = { error?: string; ok?: string } | undefined;

function normalizar(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Busca grupos do Digisac pelo nome (para o campo de busca). */
export async function buscarGruposDigisac(termo: string): Promise<{ grupos: DigisacGrupo[]; error?: string }> {
  await requireSomaStaff();
  try {
    const todos = await listarGrupos();
    const t = normalizar(termo.trim());
    const filtrados = (t ? todos.filter((g) => normalizar(g.nome).includes(t)) : todos)
      .sort((a, b) => (b.ultimaMensagem ?? "").localeCompare(a.ultimaMensagem ?? ""))
      .slice(0, 30);
    return { grupos: filtrados };
  } catch (e) {
    return { grupos: [], error: e instanceof Error ? e.message : "Não consegui falar com o Digisac." };
  }
}

export async function adicionarGrupoEmpresa(_prev: GrupoState, formData: FormData): Promise<GrupoState> {
  await requireSomaStaff();
  const companyId = String(formData.get("companyId") ?? "");
  const contactId = String(formData.get("contactId") ?? "");
  const nome = String(formData.get("nome") ?? "").trim() || null;
  if (!companyId || !contactId) return { error: "Escolha um grupo." };

  const supabase = await createClient();
  const { error } = await supabase.from("pedido_nota_vinculos").upsert(
    { origem: "DIGISAC", origem_contact_id: contactId, company_id: companyId, fonte: "CADASTRO", grupo_nome: nome },
    { onConflict: "origem,origem_contact_id,company_id" },
  );
  if (error) return { error: `Não consegui vincular: ${error.message}` };
  await logAudit({ companyId, action: "UPDATE", entity: "pedido_nota_vinculos", entityId: contactId, newValue: { grupo: nome } });
  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  return { ok: "Grupo vinculado." };
}

export async function removerGrupoEmpresa(_prev: GrupoState, formData: FormData): Promise<GrupoState> {
  await requireSomaStaff();
  const companyId = String(formData.get("companyId") ?? "");
  const vinculoId = String(formData.get("vinculoId") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.from("pedido_nota_vinculos").delete().eq("id", vinculoId).eq("company_id", companyId);
  if (error) return { error: `Não consegui remover: ${error.message}` };
  await logAudit({ companyId, action: "DELETE", entity: "pedido_nota_vinculos", entityId: vinculoId });
  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  return { ok: "Grupo removido." };
}
