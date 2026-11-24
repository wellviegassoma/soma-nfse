"use server";

// Serena — ações da carteira de IA do Simples (docs/simples-operacao-automatica.md).

import { revalidatePath } from "next/cache";
import { get, put } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { revisarComIa } from "@/lib/serena-revisor";
import { aprovarConferenciaSimplesLote } from "@/lib/actions/conferencia-simples";
import { conferirPrefeituraPetropolis } from "@/lib/actions/conferencia-prefeitura";
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
        await conferirPrefeituraPetropolis(e.id as string, input.competencia).catch(() => null);
      }
    }
    const res = await revisarComIa(supabase, input.competencia, ids);
    const revisores = await revisoresSerena();
    let aprovadas = 0;
    let escaladas = 0;
    let custo = 0;
    for (const r of res) {
      custo += r.custoUsd ?? 0;
      if (r.decisao === "APROVAR") {
        aprovadas++;
        continue;
      }
      escaladas++;
      const { data: f } = await supabase
        .from("serena_fechamentos")
        .select("tarefa_id, ia_diagnostico, ia_acoes")
        .eq("company_id", r.companyId)
        .eq("competencia", input.competencia)
        .maybeSingle();
      if (f?.tarefa_id) {
        // Já existe tarefa: só registra a nova pergunta nela.
        await supabase.from("tarefa_eventos").insert({ tarefa_id: f.tarefa_id, tipo: "COMENTARIO", comentario: `Serena: ${r.pergunta ?? r.justificativa}` });
        continue;
      }
      const responsavel = revisores.length ? revisores[(escaladas - 1) % revisores.length] : null;
      const { data: dep } = await supabase.from("atendimento_departamentos").select("id").eq("nome", "Fiscal").maybeSingle();
      const prazo = `${somarMeses(input.competencia, 1)}-12`;
      const { data: t, error } = await supabase
        .from("tarefas")
        .insert({
          modelo_id: null,
          titulo: `Serena: revisar Simples ${rotuloCompetencia(input.competencia)}`,
          descricao: [
            r.pergunta ?? r.justificativa,
            f?.ia_diagnostico ? `Diagnóstico da Serena: ${f.ia_diagnostico}` : `Análise da Serena: ${r.justificativa}`,
            Array.isArray(f?.ia_acoes) && f!.ia_acoes.length
              ? `O que fazer:\n${(f!.ia_acoes as { acao: string; onde: string }[]).map((a) => `- ${a.acao} (${a.onde})`).join("\n")}`
              : null,
            'Depois de corrigir, rode "Serena revisar" de novo ou aprove na Central do Simples — a Serena segue sozinha.',
          ]
            .filter(Boolean)
            .join("\n\n"),
          company_id: r.companyId,
          competencia: input.competencia,
          departamento_id: dep?.id,
          responsavel_id: responsavel,
          prazo_meta: prazo,
          prazo_legal: `${somarMeses(input.competencia, 1)}-20`,
        })
        .select("id")
        .single();
      if (!error && t) {
        await supabase
          .from("serena_fechamentos")
          .update({ tarefa_id: t.id, escalado_para: responsavel })
          .eq("company_id", r.companyId)
          .eq("competencia", input.competencia);
        await supabase.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "CRIADA", comentario: "Serena" });
      }
    }
    revalidar();
    return { ok: true, aprovadas, escaladas, custoUsd: custo };
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
