"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { lerCaixaPostalEmpresa, type ResultadoLeitura } from "@/lib/caixa-postal";

const CAMINHO = "/admin/intimacoes";

export type TratamentoState = { error?: string; ok?: string } | undefined;

const schema = z.object({
  mensagemId: uuidLike,
  acao: z.enum(["assumir", "atribuir", "resolver", "reabrir", "anotar"]),
  responsavelId: z.union([uuidLike, z.literal("")]).optional(),
  observacao: z.string().trim().max(2000).optional(),
});

/**
 * Tratamento interno de uma mensagem: nova → em tratamento (com responsável)
 * → resolvida (com o que foi feito). Toda mudança vai pro histórico com quem
 * e quando. Resolver exige dizer o que foi feito — "vi" não é tratamento.
 */
export async function tratarMensagem(_prev: TratamentoState, formData: FormData): Promise<TratamentoState> {
  await requireSomaStaff();
  const user = await requireUser();
  const p = schema.safeParse({
    mensagemId: formData.get("mensagemId"),
    acao: formData.get("acao"),
    responsavelId: formData.get("responsavelId") ?? undefined,
    observacao: formData.get("observacao") ?? undefined,
  });
  if (!p.success) return { error: "Dados inválidos." };
  const { mensagemId, acao, observacao } = p.data;

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("caixa_postal_mensagens")
    .select("status, responsavel_id")
    .eq("id", mensagemId)
    .maybeSingle();
  if (!atual) return { error: "Mensagem não encontrada." };

  let status = atual.status as string;
  let responsavel = (atual.responsavel_id as string | null) ?? null;
  switch (acao) {
    case "assumir":
      status = "em_tratamento";
      responsavel = user.id;
      break;
    case "atribuir":
      responsavel = p.data.responsavelId || null;
      if (responsavel && status === "nova") status = "em_tratamento";
      break;
    case "resolver":
      if (!observacao) return { error: "Para resolver, diga o que foi feito (ex.: respondida no e-CAC, DARF pago, sem ação necessária)." };
      status = "resolvida";
      responsavel = responsavel ?? user.id;
      break;
    case "reabrir":
      status = responsavel ? "em_tratamento" : "nova";
      break;
    case "anotar":
      if (!observacao) return { error: "Escreva a anotação." };
      break;
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("caixa_postal_mensagens")
    .update({
      status,
      responsavel_id: responsavel,
      ...(observacao ? { observacao } : {}),
      tratamento_em: agora,
      tratamento_por: user.id,
    })
    .eq("id", mensagemId);
  if (error) return { error: error.message };

  await supabase.from("caixa_postal_tratamentos").insert({
    mensagem_id: mensagemId,
    status,
    responsavel_id: responsavel,
    observacao: observacao || null,
    feito_por: user.id,
    feito_em: agora,
  });

  revalidatePath(CAMINHO);
  return { ok: "Salvo." };
}

/** Lê agora a Caixa Postal de uma empresa (uma chamada paga, salvo cache de 1h no integra-contador). */
export async function lerCaixaPostalAgora(companyId: string): Promise<ResultadoLeitura> {
  await requireSomaStaff();
  if (!uuidLike.safeParse(companyId).success) return { ok: false, erro: "Empresa inválida." };
  const supabase = await createClient();
  const { data: c } = await supabase.from("companies").select("id, cnpj").eq("id", companyId).maybeSingle();
  const cnpj = String(c?.cnpj ?? "").replace(/\D/g, "");
  if (!c || cnpj.length !== 14) return { ok: false, erro: "Empresa sem CNPJ." };
  const r = await lerCaixaPostalEmpresa(supabase, { id: c.id, cnpj });
  revalidatePath(CAMINHO);
  return r;
}
