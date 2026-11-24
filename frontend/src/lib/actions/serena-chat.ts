"use server";

// Conversa com a Serena: histórico e confirmação das propostas.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { buscarAtividade } from "@/lib/simples-nacional-atividades";
import type { ItemClassificacao } from "@/lib/serena-chat";

export type PropostaSerena = {
  id: string;
  titulo: string;
  status: "PENDENTE" | "APLICADA" | "DESCARTADA";
  itens: ItemClassificacao[];
  aplicados: string[] | null;
};

export type MensagemSerena = { id: string; role: "user" | "assistant"; content: string; criadaEm: string; propostas: PropostaSerena[] };

export async function historicoSerenaAction(analista: "SERENA" | "NEWTON" = "SERENA"): Promise<MensagemSerena[]> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("serena_mensagens")
    .select("id, role, content, proposta_ids, created_at")
    .eq("user_id", user.id)
    .eq("analista", analista)
    .order("created_at", { ascending: false })
    .limit(120);
  const msgs = (data ?? []).reverse();
  const ids = [...new Set(msgs.flatMap((m) => (m.proposta_ids as string[] | null) ?? []))];
  const { data: props } = ids.length
    ? await supabase.from("serena_propostas").select("id, titulo, status, itens, aplicados").in("id", ids)
    : { data: [] };
  const porId = new Map((props ?? []).map((p) => [p.id as string, p as unknown as PropostaSerena]));
  return msgs.map((m) => ({
    id: m.id as string,
    role: m.role as "user" | "assistant",
    content: m.content as string,
    criadaEm: m.created_at as string,
    propostas: ((m.proposta_ids as string[] | null) ?? []).map((id) => porId.get(id)).filter(Boolean) as PropostaSerena[],
  }));
}

export async function propostaSerenaAction(id: string): Promise<PropostaSerena | null> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("serena_propostas").select("id, titulo, status, itens, aplicados").eq("id", id).maybeSingle();
  return (data as unknown as PropostaSerena) ?? null;
}

/**
 * Aplica os itens escolhidos da proposta de classificação:
 * - SERVICO: grava a atividade no serviço cadastrado;
 * - CODIGO: nota da base nacional sem serviço no cadastro — cria um serviço
 *   INATIVO só para guardar a classificação do código (não aparece na emissão).
 */
export async function aplicarPropostaAction(input: { propostaId: string; itemIds: string[] }): Promise<{ ok: true; mensagem: string } | { error: string }> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: p } = await supabase.from("serena_propostas").select("id, status, itens").eq("id", input.propostaId).maybeSingle();
  if (!p) return { error: "Proposta não encontrada." };
  if (p.status !== "PENDENTE") return { error: "Essa proposta já foi decidida." };
  const itens = (p.itens as ItemClassificacao[]).filter((i) => input.itemIds.includes(i.id));
  if (!itens.length) return { error: "Nenhum item selecionado." };
  const aplicados: string[] = [];
  const erros: string[] = [];
  for (const i of itens) {
    if (!buscarAtividade(i.atividadeId)) {
      erros.push(i.servico);
      continue;
    }
    if (i.tipo === "SERVICO") {
      const { error } = await supabase
        .from("services")
        .update({ atividade_simples_nacional: i.atividadeId })
        .eq("id", i.id)
        .eq("company_id", i.companyId)
        .is("atividade_simples_nacional", null);
      if (error) erros.push(`${i.servico}: ${error.message}`);
      else aplicados.push(i.id);
    } else {
      const { error } = await supabase.from("services").insert({
        company_id: i.companyId,
        name: i.servico.slice(0, 200),
        description: "Criado pela Serena para classificar as notas da base nacional deste código (inativo: não aparece na emissão).",
        national_tax_code: i.codigo,
        atividade_simples_nacional: i.atividadeId,
        active: false,
      });
      if (error) erros.push(`${i.servico}: ${error.message}`);
      else aplicados.push(i.id);
    }
  }
  await supabase
    .from("serena_propostas")
    .update({ status: "APLICADA", aplicados, decidida_em: new Date().toISOString(), decidida_por: user.id })
    .eq("id", input.propostaId);
  await logAudit({
    action: "SERENA_CLASSIFICAR_SERVICOS",
    entity: "services",
    newValue: itens.filter((i) => aplicados.includes(i.id)).map((i) => ({ empresa: i.empresa, servico: i.servico, codigo: i.codigo, atividade: i.atividadeId })),
  });
  revalidatePath("/admin/serena");
  revalidatePath("/admin/fechamento/simples");
  return { ok: true, mensagem: `${aplicados.length} serviço(s) classificado(s)${erros.length ? `; ${erros.length} com erro` : ""}. As empresas serão recalculadas ao abrir a tela.` };
}

export async function descartarPropostaAction(propostaId: string): Promise<{ ok: true } | { error: string }> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("serena_propostas")
    .update({ status: "DESCARTADA", decidida_em: new Date().toISOString(), decidida_por: user.id })
    .eq("id", propostaId)
    .eq("status", "PENDENTE");
  if (error) return { error: error.message };
  return { ok: true };
}
