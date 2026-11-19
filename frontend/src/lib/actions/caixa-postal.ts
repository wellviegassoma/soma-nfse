"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { buscarConteudoCaixaPostal, lerCaixaPostalEmpresa, type ResultadoLeitura } from "@/lib/caixa-postal";

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

export type ConteudoResultado = { ok: true; corpo: string } | { ok: false; erro: string };

/**
 * Lê o conteúdo de uma mensagem (MSGDETALHAMENTO62) — DÁ CIÊNCIA da
 * intimação, igual a abrir no e-CAC. A tela só chama depois de a pessoa
 * confirmar. O texto fica guardado: abrir de novo não chama a Receita (nem
 * cobra) e o histórico registra quem deu ciência pelo SOMA e quando.
 */
export async function abrirConteudo(mensagemId: string): Promise<ConteudoResultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!uuidLike.safeParse(mensagemId).success) return { ok: false, erro: "Mensagem inválida." };
  const supabase = await createClient();
  const { data: m } = await supabase
    .from("caixa_postal_mensagens")
    .select("id, isn, corpo, lida_em, status, responsavel_id, company_id, companies(cnpj)")
    .eq("id", mensagemId)
    .maybeSingle();
  if (!m) return { ok: false, erro: "Mensagem não encontrada." };
  if (m.corpo) return { ok: true, corpo: m.corpo as string };

  const empresa = (Array.isArray(m.companies) ? m.companies[0] : m.companies) as { cnpj: string | null } | null;
  const cnpj = String(empresa?.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) return { ok: false, erro: "Empresa sem CNPJ." };

  const r = await buscarConteudoCaixaPostal(cnpj, m.isn as string);
  if (!r.ok) return r;

  const agora = new Date().toISOString();
  const jaLida = !!m.lida_em;
  await supabase
    .from("caixa_postal_mensagens")
    .update({ corpo: r.corpo, corpo_lido_em: agora, corpo_lido_por: user.id, ...(jaLida ? {} : { lida_em: agora }) })
    .eq("id", mensagemId);
  await supabase.from("caixa_postal_tratamentos").insert({
    mensagem_id: mensagemId,
    status: m.status,
    responsavel_id: m.responsavel_id,
    observacao: jaLida
      ? "Conteúdo lido no SOMA (a mensagem já tinha ciência)."
      : "Conteúdo lido no SOMA: ciência dada nesta data, prazo começa a contar.",
    feito_por: user.id,
    feito_em: agora,
  });
  revalidatePath(CAMINHO);
  return r;
}
