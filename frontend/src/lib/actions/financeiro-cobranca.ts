"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type CobrancaActionState =
  | { error?: string; sucesso?: string; at?: number }
  | undefined;

function revalidar(companyId: string) {
  revalidatePath(`/financeiro/empresas/${companyId}/cobranca`);
  revalidatePath(`/financeiro/empresas/${companyId}/receber`);
}

const CANAIS = ["EMAIL", "WHATSAPP", "TELEFONE", "OUTRO"] as const;

/** Cria a régua padrão da empresa na primeira vez que a tela abre. */
export async function semearCobrancaPadrao(
  companyId: string,
): Promise<{ error?: string }> {
  await requireFinanceiroAccess(companyId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_seed_cobranca_padrao", {
    p_company_id: companyId,
  });
  if (error) return { error: "Não foi possível criar a régua de cobrança." };
  revalidar(companyId);
  return {};
}

/**
 * Registra que a cobrança foi feita. O sistema não envia nada sozinho — não há
 * provedor de e-mail no projeto —, então quem manda é o operador e aqui fica a
 * memória. Sem esse registro a régua não anda e o cliente levaria a mesma
 * cobrança todo dia.
 */
export async function registrarCobranca(
  _prevState: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = z
    .object({
      companyId: uuidLike,
      agendamentoId: uuidLike,
      etapaId: uuidLike.optional(),
      canal: z.enum(CANAIS),
      observacao: z.string().trim().optional(),
    })
    .safeParse({
      companyId,
      agendamentoId: formData.get("agendamentoId"),
      etapaId: formData.get("etapaId") || undefined,
      canal: formData.get("canal"),
      observacao: formData.get("observacao") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("fin_cobranca_envios").insert({
    company_id: d.companyId,
    agendamento_id: d.agendamentoId,
    etapa_id: d.etapaId ?? null,
    canal: d.canal,
    observacao: d.observacao ?? null,
    created_by: user.id,
  });
  if (error) {
    // unique (agendamento_id, etapa_id)
    if (error.code === "23505") {
      return { error: "Essa etapa já foi registrada para esta conta." };
    }
    return { error: "Não foi possível registrar a cobrança." };
  }

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_cobranca_envio",
    entityId: d.agendamentoId,
    newValue: { canal: d.canal, etapaId: d.etapaId },
  });

  revalidar(d.companyId);
  return { sucesso: "Cobrança registrada.", at: Date.now() };
}

/**
 * Vincula uma NFS-e já emitida a uma conta a receber.
 *
 * De propósito NÃO emite a nota: emitir tem efeito legal e já existe um
 * caminho validado ponta a ponta (issueNfse / tela Emitir Nota). Duplicar isso
 * seria criar um segundo lugar onde uma nota fiscal errada pode nascer.
 */
export async function vincularNotaAConta(
  _prevState: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, agendamentoId: uuidLike, dpsId: uuidLike })
    .safeParse({
      companyId,
      agendamentoId: formData.get("agendamentoId"),
      dpsId: formData.get("dpsId"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();

  // A nota tem de ser da mesma empresa — sem essa checagem, um id de outra
  // empresa passaria (a RLS de `dps` deixa staff SOMA ler qualquer uma).
  const { data: nota } = await supabase
    .from("dps")
    .select("id, company_id")
    .eq("id", parsed.data.dpsId)
    .single();
  if (!nota || nota.company_id !== parsed.data.companyId) {
    return { error: "Nota não encontrada nesta empresa." };
  }

  const { error } = await supabase
    .from("fin_agendamentos")
    .update({ dps_id: parsed.data.dpsId })
    .eq("id", parsed.data.agendamentoId)
    .eq("company_id", parsed.data.companyId);
  if (error) {
    // unique parcial em dps_id
    if (error.code === "23505") {
      return { error: "Essa nota já está vinculada a outra conta a receber." };
    }
    return { error: "Não foi possível vincular a nota." };
  }

  await logAudit({
    companyId: parsed.data.companyId,
    action: "LINK",
    entity: "fin_agendamento_nfse",
    entityId: parsed.data.agendamentoId,
    newValue: { dpsId: parsed.data.dpsId },
  });

  revalidar(parsed.data.companyId);
  return { sucesso: "Nota vinculada.", at: Date.now() };
}

export async function desvincularNota(
  _prevState: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, agendamentoId: uuidLike })
    .safeParse({ companyId, agendamentoId: formData.get("agendamentoId") });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_agendamentos")
    .update({ dps_id: null })
    .eq("id", parsed.data.agendamentoId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível desvincular." };

  revalidar(parsed.data.companyId);
  return { at: Date.now() };
}

// ---------------------------------------------------------------------------
// Régua: criar e alternar etapa
// ---------------------------------------------------------------------------

export async function salvarEtapaCobranca(
  _prevState: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({
      companyId: uuidLike,
      nome: z.string().trim().min(1, "Informe o nome da etapa."),
      diasRelativos: z.coerce.number().int().min(-365).max(365),
      canal: z.enum(CANAIS),
      template: z.string().trim().min(1, "Escreva a mensagem."),
    })
    .safeParse({
      companyId,
      nome: formData.get("nome"),
      diasRelativos: formData.get("diasRelativos"),
      canal: formData.get("canal"),
      template: formData.get("template"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("fin_cobranca_etapas").insert({
    company_id: d.companyId,
    nome: d.nome,
    dias_relativos: d.diasRelativos,
    canal: d.canal,
    template: d.template,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe uma etapa nesse dia e canal." };
    }
    return { error: "Não foi possível salvar a etapa." };
  }

  revalidar(d.companyId);
  return { sucesso: "Etapa criada.", at: Date.now() };
}

export async function alternarEtapaAtiva(
  _prevState: CobrancaActionState,
  formData: FormData,
): Promise<CobrancaActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, etapaId: uuidLike, ativa: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      etapaId: formData.get("etapaId"),
      ativa: formData.get("ativa"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_cobranca_etapas")
    .update({ ativa: parsed.data.ativa === "true" })
    .eq("id", parsed.data.etapaId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível alterar a etapa." };

  revalidar(parsed.data.companyId);
  return { at: Date.now() };
}
