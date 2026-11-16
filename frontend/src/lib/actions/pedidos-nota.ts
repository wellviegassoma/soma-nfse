"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, temPermissao } from "@/lib/auth";
import { hojeBrasilia } from "@/lib/competencia";
import { uuidLike } from "@/lib/zod-helpers";
import { issueNfse } from "@/lib/actions/notas";
import { extrairPedido } from "@/lib/pedido-nota/extrair";
import { devolverNotaAoCliente } from "@/lib/pedido-nota/devolver";

// Fase 3 do pedido de nota (docs/pedido-nota-ia.md): ações do painel
// /admin/pedidos-nota. A emissão NÃO tem caminho próprio: "Aprovar e emitir"
// monta o mesmo FormData da tela Emitir Nota e chama issueNfse — mesmas
// permissões (notas.emitir na empresa), trava retroativa, retenções,
// inscrição municipal aprendida, procuração e auditoria.

export type AcaoState = { error?: string; ok?: string } | undefined;

const caminho = (pedidoId: string) => `/admin/pedidos-nota/${pedidoId}`;

async function exigirEmissor(companyId: string | null): Promise<string | null> {
  await requireUser();
  if (!(await temPermissao("notas.emitir", companyId ?? undefined))) {
    return "Sem permissão para emitir notas dessa empresa.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

export async function definirEmpresaPedido(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const parsed = z.object({ pedidoId: uuidLike, companyId: uuidLike }).safeParse({
    pedidoId: formData.get("pedidoId"),
    companyId: formData.get("companyId"),
  });
  if (!parsed.success) return { error: "Escolha uma empresa." };
  const { pedidoId, companyId } = parsed.data;
  const negado = await exigirEmissor(companyId);
  if (negado) return { error: negado };

  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("pedidos_nota")
    .select("id, status, origem, origem_contact_id")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) return { error: "Pedido não encontrado." };
  if (!["RECEBIDO", "ERRO", "AGUARDANDO_APROVACAO"].includes(pedido.status)) {
    return { error: "Esse pedido já está em emissão ou concluído." };
  }
  const { count: emitidos } = await supabase
    .from("pedido_nota_itens")
    .select("id", { count: "exact", head: true })
    .eq("pedido_id", pedidoId)
    .in("status", ["APROVADO", "EMITIDO"]);
  if (emitidos) return { error: "Esse pedido já tem nota aprovada; não dá para trocar a empresa." };

  await supabase
    .from("pedidos_nota")
    .update({ company_id: companyId, empresa_fonte: "PAINEL", status: pedido.status === "ERRO" ? "RECEBIDO" : pedido.status })
    .eq("id", pedidoId);
  // Aprende: próximo "#nota" desse contato/grupo já sai com a empresa.
  await supabase.from("pedido_nota_vinculos").upsert(
    { origem: pedido.origem, origem_contact_id: pedido.origem_contact_id, company_id: companyId, fonte: "PAINEL", pedido_id: pedidoId },
    { onConflict: "origem,origem_contact_id" },
  );

  try {
    const r = await extrairPedido(pedidoId);
    revalidatePath(caminho(pedidoId));
    return { ok: r.motivo === "ok" ? `Empresa definida. ${r.itens} rascunho(s) gerado(s).` : `Empresa definida (${r.motivo}).` };
  } catch (e) {
    revalidatePath(caminho(pedidoId));
    return { error: `Empresa definida, mas a IA falhou: ${e instanceof Error ? e.message : "erro"}. Tente "Ler de novo".` };
  }
}

export async function reextrairPedido(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const pedidoId = String(formData.get("pedidoId") ?? "");
  const supabase = await createClient();
  const { data: pedido } = await supabase.from("pedidos_nota").select("company_id").eq("id", pedidoId).maybeSingle();
  if (!pedido) return { error: "Pedido não encontrado." };
  const negado = await exigirEmissor(pedido.company_id);
  if (negado) return { error: negado };
  try {
    const r = await extrairPedido(pedidoId);
    revalidatePath(caminho(pedidoId));
    return r.motivo === "ok" ? { ok: `${r.itens} rascunho(s) gerado(s).` } : { error: r.motivo };
  } catch (e) {
    revalidatePath(caminho(pedidoId));
    return { error: e instanceof Error ? e.message : "Falha ao ler o pedido." };
  }
}

export async function descartarPedido(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const pedidoId = String(formData.get("pedidoId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;
  const supabase = await createClient();
  const { data: pedido } = await supabase.from("pedidos_nota").select("company_id").eq("id", pedidoId).maybeSingle();
  if (!pedido) return { error: "Pedido não encontrado." };
  const negado = await exigirEmissor(pedido.company_id);
  if (negado) return { error: negado };
  await supabase.from("pedido_nota_itens").update({ status: "DESCARTADO" }).eq("pedido_id", pedidoId).in("status", ["RASCUNHO", "ERRO"]);
  await atualizarStatusPedido(pedidoId, motivo);
  revalidatePath(caminho(pedidoId));
  revalidatePath("/admin/pedidos-nota");
  return { ok: "Pedido descartado." };
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

const itemSchema = z.object({
  itemId: uuidLike,
  customerId: z.string().trim().optional(),
  serviceId: z.string().trim().optional(),
  valor: z.string().trim().optional(),
  descricao: z.string().trim().optional(),
  competencia: z.string().trim().optional(),
});

function lerValor(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

async function carregarItem(itemId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pedido_nota_itens")
    .select(
      "id, pedido_id, status, customer_id, service_id, valor, descricao, competencia, iss_retido, aliquota_iss, irrf_pct, csrf_pct, inss_pct, pedido:pedidos_nota(company_id)",
    )
    .eq("id", itemId)
    .maybeSingle();
  if (!data) return null;
  const pedido = Array.isArray(data.pedido) ? data.pedido[0] : data.pedido;
  return { ...data, companyId: (pedido?.company_id as string | null) ?? null };
}

/** Grava a edição do analista (sem emitir). */
export async function salvarItem(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Dados inválidos." };
  const item = await carregarItem(parsed.data.itemId);
  if (!item) return { error: "Rascunho não encontrado." };
  const negado = await exigirEmissor(item.companyId);
  if (negado) return { error: negado };
  if (!["RASCUNHO", "ERRO"].includes(item.status)) return { error: "Esse rascunho já foi aprovado." };

  const novo = {
    customer_id: parsed.data.customerId || null,
    service_id: parsed.data.serviceId || null,
    valor: lerValor(parsed.data.valor),
    descricao: parsed.data.descricao || null,
    competencia: parsed.data.competencia || null,
  };
  const mudou =
    novo.customer_id !== item.customer_id ||
    novo.service_id !== item.service_id ||
    novo.valor !== (item.valor == null ? null : Number(item.valor)) ||
    (novo.descricao ?? null) !== (item.descricao ?? null) ||
    (novo.competencia ?? null) !== (item.competencia ?? null);

  const supabase = await createClient();
  await supabase
    .from("pedido_nota_itens")
    .update({ ...novo, ...(mudou ? { editado_pelo_humano: true } : {}) })
    .eq("id", item.id);
  revalidatePath(caminho(item.pedido_id));
  return { ok: "Rascunho salvo." };
}

export async function descartarItem(_prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const item = await carregarItem(String(formData.get("itemId") ?? ""));
  if (!item) return { error: "Rascunho não encontrado." };
  const negado = await exigirEmissor(item.companyId);
  if (negado) return { error: negado };
  if (!["RASCUNHO", "ERRO"].includes(item.status)) return { error: "Esse rascunho já foi aprovado." };
  const supabase = await createClient();
  await supabase.from("pedido_nota_itens").update({ status: "DESCARTADO" }).eq("id", item.id);
  await atualizarStatusPedido(item.pedido_id);
  revalidatePath(caminho(item.pedido_id));
  return { ok: "Rascunho descartado." };
}

/**
 * Salva o que está no formulário e emite. Trava o item (RASCUNHO/ERRO →
 * APROVADO) antes de chamar a emissão, para um duplo clique não emitir duas
 * notas.
 */
export async function aprovarEEmitirItem(prev: AcaoState, formData: FormData): Promise<AcaoState> {
  const salvo = await salvarItem(prev, formData);
  if (salvo?.error) return salvo;

  const item = await carregarItem(String(formData.get("itemId") ?? ""));
  if (!item || !item.companyId) return { error: "Rascunho sem empresa." };
  if (!item.customer_id) return { error: "Escolha o tomador (cadastre antes, se for novo)." };
  if (!item.service_id) return { error: "Escolha o serviço." };
  if (item.valor == null) return { error: "Informe o valor." };

  const user = await requireUser();
  const supabase = await createClient();
  const { data: travado } = await supabase
    .from("pedido_nota_itens")
    .update({ status: "APROVADO", aprovado_por: user.id, aprovado_em: new Date().toISOString(), erro: null })
    .eq("id", item.id)
    .in("status", ["RASCUNHO", "ERRO"])
    .select("id")
    .maybeSingle();
  if (!travado) return { error: "Esse rascunho já está sendo emitido." };

  const { data: servico } = await supabase
    .from("services")
    .select("description, retencao_irrf_aliquota, retencao_pis_cofins_csll_aliquota")
    .eq("id", item.service_id)
    .single();

  const fd = new FormData();
  fd.set("companyId", item.companyId);
  fd.set("customerId", item.customer_id);
  fd.set("serviceId", item.service_id);
  fd.set("amount", Number(item.valor).toFixed(2));
  fd.set("description", item.descricao || servico?.description || "Prestação de serviços");
  fd.set("competenceDate", item.competencia || hojeBrasilia());
  // Retenções: sem informação explícita no pedido, deixa issueNfse usar o
  // padrão do serviço (não manda os campos). Com ISS retido/não retido
  // explícito, manda o resto com o padrão do serviço.
  if (item.iss_retido != null) {
    fd.set("issRetido", item.iss_retido ? "1" : "0");
    if (item.aliquota_iss != null) fd.set("aliquotaIss", String(item.aliquota_iss));
    const irrf = item.irrf_pct ?? servico?.retencao_irrf_aliquota;
    const csrf = item.csrf_pct ?? servico?.retencao_pis_cofins_csll_aliquota;
    if (irrf != null) fd.set("irrfPct", String(irrf));
    if (csrf != null) fd.set("csrfPct", String(csrf));
    if (item.inss_pct != null) fd.set("inssPct", String(item.inss_pct));
  }

  const r = await issueNfse(undefined, fd);
  if (!r?.success || !r.dpsId) {
    const motivos = r?.motivos?.map((m) => m.mensagem ?? m.codigo).filter(Boolean).join(" · ");
    const erro = [r?.error ?? "Falha na emissão.", motivos].filter(Boolean).join(" — ");
    await supabase.from("pedido_nota_itens").update({ status: "ERRO", erro }).eq("id", item.id);
    await atualizarStatusPedido(item.pedido_id);
    revalidatePath(caminho(item.pedido_id));
    return { error: erro };
  }

  await supabase.from("pedido_nota_itens").update({ status: "EMITIDO", dps_id: r.dpsId, erro: null }).eq("id", item.id);
  await atualizarStatusPedido(item.pedido_id);
  // PDF/XML para o cliente no Digisac — fora do caminho da resposta.
  after(async () => {
    const d = await devolverNotaAoCliente(item.id).catch((e) => ({ enviado: false, motivo: String(e) }));
    console.log("[pedido-nota] devolução:", d.motivo);
  });
  revalidatePath(caminho(item.pedido_id));
  revalidatePath("/admin/pedidos-nota");
  return { ok: "Nota emitida." };
}

// ---------------------------------------------------------------------------

/** Status do pedido a partir dos itens. */
async function atualizarStatusPedido(pedidoId: string, motivoDescarte?: string | null) {
  const admin = createAdminClient();
  const { data: itens } = await admin.from("pedido_nota_itens").select("status").eq("pedido_id", pedidoId);
  const st = (itens ?? []).map((i) => i.status as string);
  const emitidos = st.filter((s) => s === "EMITIDO").length;
  const abertos = st.filter((s) => ["RASCUNHO", "ERRO", "APROVADO"].includes(s)).length;
  const temErro = st.includes("ERRO");
  let status: string;
  if (abertos === 0) status = emitidos > 0 ? "EMITIDA" : "DESCARTADO";
  else if (emitidos > 0) status = "PARCIAL";
  else status = temErro ? "ERRO" : "AGUARDANDO_APROVACAO";
  await admin
    .from("pedidos_nota")
    .update({ status, ...(status === "DESCARTADO" && motivoDescarte ? { descartado_motivo: motivoDescarte } : {}) })
    .eq("id", pedidoId);
}
