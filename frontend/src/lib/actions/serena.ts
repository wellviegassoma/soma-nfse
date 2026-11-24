"use server";

// Serena — ações da carteira de IA do Simples (docs/simples-operacao-automatica.md).

import { revalidatePath } from "next/cache";
import { get, put } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { revisarComIa } from "@/lib/serena-revisor";
import { aprovarConferenciaSimplesLote } from "@/lib/actions/conferencia-simples";
import { conferirPetropolis } from "@/lib/serena-rotina";
import { carregarEsteira } from "@/lib/serena";
import { IBGE_PETROPOLIS } from "@/lib/tarefas-comum";
import { enviarTexto, servicoDoContato } from "@/lib/digisac/client";
import { listarEquipe } from "@/lib/tarefas";
import { casaObrigacao } from "@/lib/tarefas";
import { somarMeses, rotuloCompetencia } from "@/lib/tarefas-comum";

type Resultado = { ok: true; mensagem?: string } | { error: string };
const COMPETENCIA = /^\d{4}-\d{2}$/;

function revalidar() {
  revalidatePath("/admin/serena");
  revalidatePath("/admin/fechamento/simples");
  revalidatePath("/admin/tarefas", "layout");
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ------------------------------------------------------------- revisores

export async function revisoresSerena(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("serena_config").select("valor").eq("chave", "revisores").maybeSingle();
  return Array.isArray(data?.valor) ? (data!.valor as string[]) : [];
}

export async function salvarRevisoresAction(userIds: string[]): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { error } = await supabase
    .from("serena_config")
    .upsert({ chave: "revisores", valor: userIds, atualizado_em: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/admin/serena");
  return { ok: true, mensagem: "Revisores salvos." };
}

// ---------------------------------------------------------------- revisão

/**
 * Revisa com IA um bloco de empresas (a tela manda de 5 em 5). Decisão
 * ESCALAR vira tarefa avulsa para um dos revisores (revezando), com a
 * pergunta exata da Serena.
 */
export async function revisarSerenaAction(input: { competencia: string; companyIds: string[] }): Promise<
  { ok: true; aprovadas: number; escaladas: number; custoUsd: number } | { error: string }
> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  try {
    const ids = input.companyIds.slice(0, 10);
    // Antes de revisar, a Serena resolve o que é seguro sozinha: confere com a
    // Prefeitura de Petrópolis quem ainda não foi conferido (só consulta).
    const [{ data: emp }, { data: conf }] = await Promise.all([
      supabase.from("companies").select("id, municipality_ibge_code").in("id", ids),
      supabase.from("conferencia_prefeitura").select("company_id").eq("competencia", input.competencia).in("company_id", ids),
    ]);
    const jaConferidas = new Set((conf ?? []).map((c) => c.company_id as string));
    for (const e of emp ?? []) {
      if (e.municipality_ibge_code === IBGE_PETROPOLIS && !jaConferidas.has(e.id as string)) {
        await conferirPetropolis(supabase, e.id as string, input.competencia, user.id).catch(() => null);
      }
    }
    const res = await revisarComIa(supabase, input.competencia, ids);
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

/** Aprovação final (humana) das empresas que a Serena recomendou aprovar. */
export async function aprovarRecomendacoesAction(input: {
  competencia: string;
  itens: { companyId: string; assinatura: string }[];
}): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("serena_fechamentos")
    .select("company_id, ia_decisao, ia_assinatura")
    .eq("competencia", input.competencia)
    .in("company_id", input.itens.map((i) => i.companyId));
  const valida = new Map((rec ?? []).filter((r) => r.ia_decisao === "APROVAR").map((r) => [r.company_id as string, r.ia_assinatura as string]));
  const itens = input.itens.filter((i) => valida.get(i.companyId) === i.assinatura);
  if (!itens.length) return { error: "Nenhuma recomendação válida (o cálculo pode ter mudado — rode a revisão de novo)." };
  const r = await aprovarConferenciaSimplesLote(input.competencia, itens, `Aprovado pela revisão da Serena (IA), confirmado por ${user.email ?? "equipe"}.`);
  if (r.erroGeral) return { error: r.erroGeral };
  revalidar();
  return { ok: true, mensagem: `${r.aprovadas} aprovada(s)${r.recusadas.length ? `; ${r.recusadas.length} recusada(s)` : ""}.` };
}

// ------------------------------------------------------------------- DAS

/** Gera o DAS na Receita (GERARDAS12, cobrado) uma vez e guarda no Blob privado. */
export async function gerarDasSerenaAction(input: { companyId: string; competencia: string }): Promise<Resultado> {
  await requireSomaStaff();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  const { data: ja } = await supabase
    .from("serena_fechamentos")
    .select("das_blob_pathname")
    .eq("company_id", input.companyId)
    .eq("competencia", input.competencia)
    .maybeSingle();
  if (ja?.das_blob_pathname) return { ok: true, mensagem: "DAS já estava salvo." };
  const { data: company } = await supabase.from("companies").select("cnpj").eq("id", input.companyId).single();
  if (!company?.cnpj) return { error: "Empresa sem CNPJ." };
  const periodo = input.competencia.replace("-", "");
  let body: { resposta?: { dados?: string }; detail?: string } | null = null;
  try {
    const r = await fetch(`${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/simples/pgdas-d/das/${periodo}`, {
      headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    body = await r.json().catch(() => null);
    if (!r.ok) return { error: body?.detail ?? `Integra Contador respondeu HTTP ${r.status}.` };
  } catch {
    return { error: "Não foi possível gerar o DAS agora." };
  }
  const dados = body?.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const das = Array.isArray(dados) ? dados[0] : dados;
  if (!das?.pdf) return { error: "A Receita não devolveu o PDF do DAS (a competência foi transmitida?)." };
  const pathname = `serena/das/${input.competencia}/${input.companyId}.pdf`;
  await put(pathname, Buffer.from(das.pdf, "base64"), { access: "private", contentType: "application/pdf", allowOverwrite: true });
  const { error } = await supabase.from("serena_fechamentos").upsert(
    { company_id: input.companyId, competencia: input.competencia, das_blob_pathname: pathname, das_gerado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() },
    { onConflict: "company_id,competencia" },
  );
  if (error) return { error: error.message };
  revalidar();
  return { ok: true };
}

/** Marca como entregue no eContador (depois de subir o ZIP). */
export async function marcarEntregueAction(input: { competencia: string; companyIds: string[] }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const { error } = await supabase.from("serena_fechamentos").upsert(
    input.companyIds.map((id) => ({ company_id: id, competencia: input.competencia, entregue_em: agora, entregue_por: user.id, atualizado_em: agora })),
    { onConflict: "company_id,competencia" },
  );
  if (error) return { error: error.message };
  // Guias de ISS do Rio emitidas que foram no mesmo ZIP.
  await supabase
    .from("serena_guias_iss")
    .update({ entregue_em: agora })
    .in("company_id", input.companyIds)
    .eq("status", "EMITIDA")
    .is("entregue_em", null);
  revalidar();
  return { ok: true, mensagem: `${input.companyIds.length} marcada(s) como entregue(s) no eContador.` };
}

// ---------------------------------------------------------------- Digisac

async function vencimentoDas(supabase: Awaited<ReturnType<typeof createClient>>, competencia: string): Promise<string> {
  const mes = somarMeses(competencia, 1);
  const { data } = await supabase.from("agenda_tributaria_itens").select("tipo, codigo, descricao, vencimento").eq("mes", `${mes}-01`);
  const item = (data ?? []).find((i) => i.vencimento && casaObrigacao(i as never, "DECLARACAO:pgdas-d"));
  const iso = (item?.vencimento as string | undefined) ?? `${mes}-20`;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export type MensagemPrevia = { companyId: string; empresa: string; grupo: string | null; texto: string };

/** Monta (não envia) as mensagens para os grupos dos clientes. */
export async function previaMensagensAction(input: {
  competencia: string;
  tipo: "GUIA" | "COBRANCA";
  itens: { companyId: string; empresa: string; das: number }[];
}): Promise<{ mensagens: MensagemPrevia[] } | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const venc = await vencimentoDas(supabase, input.competencia);
  const { data: vinc } = await supabase
    .from("pedido_nota_vinculos")
    .select("company_id, origem_contact_id, grupo_nome")
    .in("company_id", input.itens.map((i) => i.companyId));
  const grupo = new Map((vinc ?? []).map((v) => [v.company_id as string, (v.grupo_nome as string | null) ?? "grupo"]));
  const comp = rotuloCompetencia(input.competencia);
  return {
    mensagens: input.itens.map((i) => ({
      companyId: i.companyId,
      empresa: i.empresa,
      grupo: grupo.get(i.companyId) ?? null,
      texto:
        input.tipo === "GUIA"
          ? `Olá! O DAS do Simples Nacional de ${comp} da ${i.empresa} já está disponível no eContador. Valor: ${brl(i.das)} · vencimento ${venc}. Qualquer dúvida, estamos à disposição. — SOMA`
          : `Olá! Ainda não identificamos o pagamento do DAS do Simples Nacional de ${comp} da ${i.empresa} (${brl(i.das)}), que vence em ${venc}. A guia está no eContador. Se já pagou, pode desconsiderar. — SOMA`,
    })),
  };
}

/** Envia as mensagens revisadas (um clique de alguém da equipe). */
export async function enviarMensagensAction(input: {
  competencia: string;
  tipo: "GUIA" | "COBRANCA";
  mensagens: { companyId: string; texto: string }[];
}): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: vinc } = await supabase
    .from("pedido_nota_vinculos")
    .select("company_id, origem_contact_id")
    .in("company_id", input.mensagens.map((m) => m.companyId));
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
      await supabase
        .from("serena_fechamentos")
        .upsert({ company_id: m.companyId, competencia: input.competencia, [campo]: new Date().toISOString(), atualizado_em: new Date().toISOString() }, { onConflict: "company_id,competencia" });
      enviadas++;
    } catch {
      falhas.push(m.companyId);
    }
  }
  revalidar();
  return { ok: true, mensagem: `${enviadas} mensagem(ns) enviada(s)${falhas.length ? `; ${falhas.length} sem grupo do Digisac ou com erro` : ""}.` };
}

// ------------------------------------------------------------- carteira

export async function salvarExcecaoSerenaAction(input: { companyId: string; tipo: "INCLUIR" | "EXCLUIR" | null; motivo?: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = input.tipo
    ? await supabase.from("serena_excecoes").upsert({ company_id: input.companyId, tipo: input.tipo, motivo: input.motivo ?? null, atualizado_por: user.id, atualizado_em: new Date().toISOString() })
    : await supabase.from("serena_excecoes").delete().eq("company_id", input.companyId);
  if (error) return { error: error.message };
  revalidatePath("/admin/serena");
  return { ok: true };
}

export async function equipeSerenaAction() {
  await requireSomaStaff();
  return listarEquipe();
}

/** Conteúdo de um DAS salvo (para o ZIP do eContador). */
export async function dasSalvoBase64Action(input: { companyId: string; competencia: string }): Promise<{ base64: string } | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("serena_fechamentos")
    .select("das_blob_pathname")
    .eq("company_id", input.companyId)
    .eq("competencia", input.competencia)
    .maybeSingle();
  if (!data?.das_blob_pathname) return { error: "DAS não salvo." };
  const blob = await get(data.das_blob_pathname as string, { access: "private" });
  if (!blob || blob.statusCode !== 200) return { error: "Arquivo não encontrado." };
  const buf = Buffer.from(await new Response(blob.stream).arrayBuffer());
  return { base64: buf.toString("base64") };
}

// ------------------------------------------- guias de ISS no Rio (fora do DAS)

type LinhaGuiaRio = { competencia: string; valor: number | null; origem: string; documento: string; receitas?: { codigo: string; descricao: string; base: number | null; principal: number | null }[] };
type PendenteAnteriorRio = { competencia: string; valor_texto: string; origem: string };

function valorBr(t: string): number | null {
  const n = Number(t.replace(/[^\d,]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Grava a leitura da grade de guias da Nota Carioca (robô existente, só
 * leitura): pendentes ("EMITIR GUIA") viram alerta; as que sumiram da lista
 * de pendentes e não foram emitidas por aqui saem do alerta.
 */
export async function salvarLeituraGuiasRioAction(input: {
  companyId: string;
  resultado: { linhas: LinhaGuiaRio[]; pendentes_anteriores: PendenteAnteriorRio[] } | { erro: string };
}): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const agora = new Date().toISOString();
  if ("erro" in input.resultado) {
    await supabase.from("serena_guias_iss_consultas").upsert({ company_id: input.companyId, consultado_em: agora, pendentes: 0, erro: input.resultado.erro.slice(0, 300) });
    return { ok: true };
  }
  const pend = new Map<string, { valor: number | null; origem: string; receitas: LinhaGuiaRio["receitas"] | null }>();
  for (const l of input.resultado.linhas) {
    if (l.documento.toUpperCase() === "EMITIR GUIA") pend.set(l.competencia, { valor: l.valor, origem: l.origem, receitas: l.receitas ?? null });
  }
  for (const p of input.resultado.pendentes_anteriores) {
    if (!pend.has(p.competencia)) pend.set(p.competencia, { valor: valorBr(p.valor_texto), origem: p.origem, receitas: null });
  }
  const { data: atuais } = await supabase.from("serena_guias_iss").select("competencia, status").eq("company_id", input.companyId);
  const sumiram = (atuais ?? []).filter((a) => a.status === "PENDENTE" && !pend.has(a.competencia as string)).map((a) => a.competencia as string);
  if (sumiram.length) await supabase.from("serena_guias_iss").delete().eq("company_id", input.companyId).eq("status", "PENDENTE").in("competencia", sumiram);
  const emitidas = new Set((atuais ?? []).filter((a) => a.status !== "PENDENTE").map((a) => a.competencia as string));
  const linhas = [...pend.entries()]
    .filter(([c]) => !emitidas.has(c))
    .map(([competencia, p]) => ({ company_id: input.companyId, competencia, valor: p.valor, origem: p.origem, receitas: p.receitas, status: "PENDENTE", consultado_em: agora }));
  if (linhas.length) {
    const { error } = await supabase.from("serena_guias_iss").upsert(linhas, { onConflict: "company_id,competencia" });
    if (error) return { error: error.message };
  }
  await supabase.from("serena_guias_iss_consultas").upsert({ company_id: input.companyId, consultado_em: agora, pendentes: linhas.length, erro: null });
  revalidatePath("/admin/serena");
  return { ok: true, mensagem: `${linhas.length} guia(s) pendente(s).` };
}

/** Depois que a tela emitiu a guia (rota impostos/guia-iss?registrar=0), guarda o PDF. */
export async function salvarGuiaEmitidaAction(input: { companyId: string; competencia: string; base64: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  const pathname = `serena/guias-iss/${input.competencia}/${input.companyId}.pdf`;
  await put(pathname, Buffer.from(input.base64, "base64"), { access: "private", contentType: "application/pdf", allowOverwrite: true });
  const { error } = await supabase
    .from("serena_guias_iss")
    .update({ status: "EMITIDA", pdf_blob_pathname: pathname, emitida_em: new Date().toISOString(), emitida_por: user.id })
    .eq("company_id", input.companyId)
    .eq("competencia", input.competencia);
  if (error) return { error: error.message };
  revalidatePath("/admin/serena");
  return { ok: true };
}

/** PDFs das guias de ISS emitidas e ainda não entregues (para o ZIP do eContador). */
export async function guiasEmitidasBase64Action(companyId: string): Promise<{ competencia: string; base64: string }[]> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data } = await supabase
    .from("serena_guias_iss")
    .select("competencia, pdf_blob_pathname")
    .eq("company_id", companyId)
    .eq("status", "EMITIDA")
    .is("entregue_em", null);
  const out: { competencia: string; base64: string }[] = [];
  for (const g of data ?? []) {
    if (!g.pdf_blob_pathname) continue;
    const blob = await get(g.pdf_blob_pathname as string, { access: "private" });
    if (!blob || blob.statusCode !== 200) continue;
    out.push({ competencia: g.competencia as string, base64: Buffer.from(await new Response(blob.stream).arrayBuffer()).toString("base64") });
  }
  return out;
}

// ------------------------------------------ aceitar e seguir / por empresa

/**
 * "Aceitar e seguir": a equipe passa por cima de um motivo da conferência
 * (ex.: erro de login na prefeitura → fechar com as notas do portal), com
 * justificativa. Quando não sobra motivo de revisão, a empresa é aprovada
 * (mesma aprovação da Central do Simples). Bloqueio de declaração não passa.
 */
export async function aceitarMotivoSerenaAction(input: { companyId: string; competencia: string; codigo: string; justificativa: string | null }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  const supabase = await createClient();
  const linha = (await carregarEsteira(supabase, input.competencia)).find((l) => l.id === input.companyId);
  if (!linha) return { error: "Empresa fora da carteira da Serena." };
  const motivo = linha.motivos.find((m) => m.codigo === input.codigo);
  if (!motivo) return { error: "Esse motivo já não está pendente." };
  if (motivo.nivel === "BLOQUEADO") return { error: "Bloqueio de declaração não dá para pular — sem isso o PGDAS-D não pode ser montado. Resolva o cadastro." };
  const { data: atual } = await supabase.from("serena_fechamentos").select("motivos_aceitos").eq("company_id", input.companyId).eq("competencia", input.competencia).maybeSingle();
  const lista = [...(((atual?.motivos_aceitos as unknown[]) ?? []) as { codigo: string }[]).filter((a) => a.codigo !== input.codigo), { codigo: input.codigo, justificativa: input.justificativa, por: user.email ?? user.id, em: new Date().toISOString() }];
  const { error } = await supabase
    .from("serena_fechamentos")
    .upsert({ company_id: input.companyId, competencia: input.competencia, motivos_aceitos: lista, atualizado_em: new Date().toISOString() }, { onConflict: "company_id,competencia" });
  if (error) return { error: error.message };
  const restantes = linha.motivos.filter((m) => m.codigo !== input.codigo);
  if (!restantes.length && linha.conferencia === "REVISAR" && !linha.aprovada) {
    const obs = `Aceito na tela da Serena por ${user.email ?? "equipe"}: ${lista.map((a) => `${a.codigo}${"justificativa" in a && a.justificativa ? ` (${a.justificativa})` : ""}`).join("; ")}`;
    const r = await aprovarConferenciaSimplesLote(input.competencia, [{ companyId: input.companyId, assinatura: linha.assinatura }], obs.slice(0, 900));
    if (r.erroGeral || r.recusadas.length) return { error: r.erroGeral ?? r.recusadas[0].erro };
    revalidar();
    return { ok: true, mensagem: "Motivo aceito — empresa liberada para transmitir." };
  }
  revalidar();
  return { ok: true, mensagem: `Motivo aceito${restantes.length ? `; faltam ${restantes.length}` : ""}.` };
}

/** Confere uma empresa com a Prefeitura de Petrópolis agora (só consulta). */
export async function conferirPrefeituraUmaAction(input: { companyId: string; competencia: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const ok = await conferirPetropolis(supabase, input.companyId, input.competencia, user.id).catch(() => false);
  revalidar();
  revalidatePath("/admin/newton");
  return ok ? { ok: true, mensagem: "Conferido com a prefeitura." } : { error: "A prefeitura não respondeu ou recusou o acesso — veja o erro na etapa; se não tiver jeito, use 'aceitar' no motivo." };
}
