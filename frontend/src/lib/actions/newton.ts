"use server";

// Newton — ações da carteira de IA do Lucro Presumido (Petrópolis e Rio).
// Encerrar o MIT e transmitir a DCTFWeb usam as rotas que já existem (a tela
// chama, empresa a empresa, com confirmação); aqui ficam aprovação, DARF,
// entrega, mensagens, pagamento e carteira.

import { revalidatePath } from "next/cache";
import { get, put } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { carregarEsteiraNewton } from "@/lib/newton";
import { revisarComIaNewton } from "@/lib/newton-revisor";
import { escalarNewton } from "@/lib/newton-rotina";
import { conferirPetropolis } from "@/lib/serena-rotina";
import { consultarPagamentosFederais } from "@/lib/pagamentos-federais";
import { acharPdfBase64, ehDas } from "@/lib/pagamentos-federais-core";
import { enviarTexto, servicoDoContato } from "@/lib/digisac/client";
import { rotuloCompetencia } from "@/lib/tarefas-comum";

type Resultado = { ok: true; mensagem?: string } | { error: string };
const COMPETENCIA = /^\d{4}-\d{2}$/;

function revalidar() {
  revalidatePath("/admin/newton");
  revalidatePath("/admin/tarefas", "layout");
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function upsertFechamento(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, competencia: string, campos: Record<string, unknown>) {
  return supabase
    .from("newton_fechamentos")
    .upsert({ company_id: companyId, competencia, ...campos, atualizado_em: new Date().toISOString() }, { onConflict: "company_id,competencia" });
}

// -------------------------------------------------------------- revisores

export async function salvarRevisoresNewtonAction(userIds: string[]): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { error } = await supabase.from("serena_config").upsert({ chave: "newton_revisores", valor: userIds, atualizado_em: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/admin/newton");
  return { ok: true, mensagem: "Revisores salvos." };
}

// --------------------------------------------------------------- revisão

export async function revisarNewtonAction(input: { competencia: string; companyIds: string[] }): Promise<
  { ok: true; aprovadas: number; escaladas: number; custoUsd: number } | { error: string }
> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  try {
    const ids = input.companyIds.slice(0, 10);
    // Antes de revisar, confere com a Prefeitura de Petrópolis quem ainda não foi conferido (só consulta).
    const [{ data: emp }, { data: conf }] = await Promise.all([
      supabase.from("companies").select("id, municipality_ibge_code").in("id", ids),
      supabase.from("conferencia_prefeitura").select("company_id").eq("competencia", input.competencia).in("company_id", ids),
    ]);
    const ja = new Set((conf ?? []).map((c) => c.company_id as string));
    for (const e of emp ?? []) {
      if (e.municipality_ibge_code === "3303906" && !ja.has(e.id as string)) await conferirPetropolis(supabase, e.id as string, input.competencia, user.id).catch(() => null);
    }
    const res = await revisarComIaNewton(supabase, input.competencia, ids);
    await escalarNewton(supabase, input.competencia, res);
    revalidar();
    return {
      ok: true,
      aprovadas: res.filter((r) => r.decisao === "APROVAR").length,
      escaladas: res.filter((r) => r.decisao === "ESCALAR").length,
      custoUsd: res.reduce((t, r) => t + (r.custoUsd ?? 0), 0),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Aprovação humana do cálculo (empresas em "Revisar"). Vale para a assinatura
 * do cálculo de agora — mudou nota/retenção, precisa aprovar de novo.
 */
export async function aprovarNewtonAction(input: { competencia: string; itens: { companyId: string; assinatura: string }[] }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  const linhas = await carregarEsteiraNewton(supabase, input.competencia);
  const atual = new Map(linhas.map((l) => [l.id, l]));
  const validos = input.itens.filter((i) => {
    const l = atual.get(i.companyId);
    return l && l.conferencia === "REVISAR" && l.assinatura === i.assinatura;
  });
  if (!validos.length) return { error: "Nenhuma empresa válida para aprovar (o cálculo pode ter mudado — recarregue)." };
  const agora = new Date().toISOString();
  const { error } = await supabase.from("newton_fechamentos").upsert(
    validos.map((i) => ({ company_id: i.companyId, competencia: input.competencia, aprovado_assinatura: i.assinatura, aprovado_em: agora, aprovado_por: user.id, atualizado_em: agora })),
    { onConflict: "company_id,competencia" },
  );
  if (error) return { error: error.message };
  revalidar();
  return { ok: true, mensagem: `${validos.length} aprovada(s).` };
}

// ----------------------------------------------------- DCTFWeb e DARF

/** A tela transmitiu a DCTFWeb (rota existente) — registra no fechamento. */
export async function marcarDctfwebNewtonAction(input: { companyId: string; competencia: string }): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { error } = await upsertFechamento(supabase, input.companyId, input.competencia, { dctfweb_transmitida_em: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

/** Gera a guia da DCTFWeb (GERARGUIA31, cobrado) uma vez e guarda no Blob privado. */
export async function gerarDarfNewtonAction(input: { companyId: string; competencia: string }): Promise<Resultado> {
  await requireSomaStaff();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  const { data: ja } = await supabase.from("newton_fechamentos").select("darf_blob_pathname").eq("company_id", input.companyId).eq("competencia", input.competencia).maybeSingle();
  if (ja?.darf_blob_pathname) return { ok: true, mensagem: "DARF já estava salvo." };
  const { data: company } = await supabase.from("companies").select("cnpj").eq("id", input.companyId).single();
  if (!company?.cnpj) return { error: "Empresa sem CNPJ." };
  const [ano, mes] = input.competencia.split("-");
  let body: unknown = null;
  try {
    const r = await fetch(`${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/dctfweb/guia/${ano}/${mes}`, {
      headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    body = await r.json().catch(() => null);
    if (!r.ok) return { error: (body as { detail?: string } | null)?.detail ?? `Integra Contador respondeu HTTP ${r.status}.` };
  } catch {
    return { error: "Não foi possível gerar a guia agora." };
  }
  const pdf = acharPdfBase64(body);
  if (!pdf) return { error: "A Receita não devolveu o PDF da guia (a DCTFWeb foi transmitida?)." };
  const pathname = `newton/darf/${input.competencia}/${input.companyId}.pdf`;
  await put(pathname, Buffer.from(pdf, "base64"), { access: "private", contentType: "application/pdf", allowOverwrite: true });
  const { error } = await upsertFechamento(supabase, input.companyId, input.competencia, { darf_blob_pathname: pathname, darf_gerado_em: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

export async function darfSalvoBase64Action(input: { companyId: string; competencia: string }): Promise<{ base64: string } | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data } = await supabase.from("newton_fechamentos").select("darf_blob_pathname").eq("company_id", input.companyId).eq("competencia", input.competencia).maybeSingle();
  if (!data?.darf_blob_pathname) return { error: "DARF não salvo." };
  const blob = await get(data.darf_blob_pathname as string, { access: "private" });
  if (!blob || blob.statusCode !== 200) return { error: "Arquivo não encontrado." };
  return { base64: Buffer.from(await new Response(blob.stream).arrayBuffer()).toString("base64") };
}

export async function marcarEntregueNewtonAction(input: { competencia: string; companyIds: string[] }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const { error } = await supabase.from("newton_fechamentos").upsert(
    input.companyIds.map((id) => ({ company_id: id, competencia: input.competencia, entregue_em: agora, entregue_por: user.id, atualizado_em: agora })),
    { onConflict: "company_id,competencia" },
  );
  if (error) return { error: error.message };
  revalidar();
  return { ok: true, mensagem: `${input.companyIds.length} marcada(s) como entregue(s) no eContador.` };
}

// ------------------------------------------------------------- pagamento

/** PAGAMENTOS71 (cobrado): algum DARF (não DAS) do período foi pago? */
export async function verificarPagamentoNewtonAction(input: { companyId: string; competencia: string }): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("cnpj").eq("id", input.companyId).single();
  if (!company?.cnpj) return { error: "Empresa sem CNPJ." };
  const r = await consultarPagamentosFederais(company.cnpj, input.competencia);
  if (!r.ok) return { error: r.erro };
  const darfs = r.pagamentos.filter((p) => !ehDas(p) && p.periodoApuracao === input.competencia);
  const { error } = await upsertFechamento(supabase, input.companyId, input.competencia, { pago: darfs.length > 0, pagamento_verificado_em: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidar();
  return { ok: true, mensagem: darfs.length ? `Pago (${brl(darfs.reduce((t, p) => t + p.valorTotal, 0))}).` : "Sem pagamento encontrado." };
}

// --------------------------------------------------------------- Digisac

export type MensagemPreviaNewton = { companyId: string; empresa: string; grupo: string | null; texto: string };

export async function previaMensagensNewtonAction(input: {
  competencia: string;
  tipo: "GUIA" | "COBRANCA";
  itens: { companyId: string; empresa: string; total: number; comIrpj: boolean }[];
}): Promise<{ mensagens: MensagemPreviaNewton[] } | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: vinc } = await supabase.from("pedido_nota_vinculos").select("company_id, grupo_nome").in("company_id", input.itens.map((i) => i.companyId));
  const grupo = new Map((vinc ?? []).map((v) => [v.company_id as string, (v.grupo_nome as string | null) ?? "grupo"]));
  const comp = rotuloCompetencia(input.competencia);
  return {
    mensagens: input.itens.map((i) => {
      const tributos = i.comIrpj ? "PIS, COFINS, IRPJ e CSLL" : "PIS e COFINS";
      return {
        companyId: i.companyId,
        empresa: i.empresa,
        grupo: grupo.get(i.companyId) ?? null,
        texto:
          input.tipo === "GUIA"
            ? `Olá! A guia (DARF) dos impostos federais de ${comp} da ${i.empresa} — ${tributos}, ${brl(i.total)} — já está disponível no eContador. Confira o vencimento na guia. Qualquer dúvida, estamos à disposição. — SOMA`
            : `Olá! Ainda não identificamos o pagamento da guia (DARF) dos impostos federais de ${comp} da ${i.empresa} (${tributos}). A guia está no eContador. Se já pagou, pode desconsiderar. — SOMA`,
      };
    }),
  };
}

export async function enviarMensagensNewtonAction(input: { competencia: string; tipo: "GUIA" | "COBRANCA"; mensagens: { companyId: string; texto: string }[] }): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: vinc } = await supabase.from("pedido_nota_vinculos").select("company_id, origem_contact_id").in("company_id", input.mensagens.map((m) => m.companyId));
  const contato = new Map<string, string>();
  for (const v of vinc ?? []) if (!contato.has(v.company_id as string)) contato.set(v.company_id as string, v.origem_contact_id as string);
  let enviadas = 0;
  const falhas: string[] = [];
  const campo = input.tipo === "GUIA" ? "mensagem_guia_em" : "mensagem_cobranca_em";
  for (const m of input.mensagens) {
    const contactId = contato.get(m.companyId);
    if (!contactId) {
      falhas.push(m.companyId);
      continue;
    }
    try {
      await enviarTexto({ contactId, serviceId: await servicoDoContato(contactId), texto: m.texto.slice(0, 2000) });
      await upsertFechamento(supabase, m.companyId, input.competencia, { [campo]: new Date().toISOString() });
      enviadas++;
    } catch {
      falhas.push(m.companyId);
    }
  }
  revalidar();
  return { ok: true, mensagem: `${enviadas} mensagem(ns) enviada(s)${falhas.length ? `; ${falhas.length} sem grupo do Digisac ou com erro` : ""}.` };
}

// -------------------------------------------------------------- carteira

export async function salvarExcecaoNewtonAction(input: { companyId: string; tipo: "INCLUIR" | "EXCLUIR" | null; motivo?: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = input.tipo
    ? await supabase.from("newton_excecoes").upsert({ company_id: input.companyId, tipo: input.tipo, motivo: input.motivo ?? null, atualizado_por: user.id, atualizado_em: new Date().toISOString() })
    : await supabase.from("newton_excecoes").delete().eq("company_id", input.companyId);
  if (error) return { error: error.message };
  revalidatePath("/admin/newton");
  return { ok: true };
}
