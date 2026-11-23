"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireSuperAdmin, requireUser } from "@/lib/auth";
import { gerarTarefas } from "@/lib/tarefas";
import { garantirEtapas, recalcularTarefas, sincronizarAutomacoes } from "@/lib/tarefas-automacao";
import { FONTES_ROTULO } from "@/lib/tarefas-comum";
import type { StatusTarefa } from "@/lib/tarefas-comum";

type Resultado = { ok: true; mensagem?: string } | { error: string };

const COMPETENCIA = /^\d{4}-\d{2}$/;
const STATUS: StatusTarefa[] = ["A_FAZER", "EM_ANDAMENTO", "CONCLUIDA", "NAO_SE_APLICA"];

function revalidar() {
  revalidatePath("/admin/tarefas", "layout");
  revalidatePath("/admin");
}

// ---------------------------------------------------------------- tarefas

/** Muda o status de uma ou mais tarefas (concluir, não se aplica, reabrir…). */
export async function mudarStatusTarefasAction(input: {
  ids: string[];
  status: StatusTarefa;
  comentario?: string | null;
}): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!input.ids.length) return { error: "Nenhuma tarefa selecionada." };
  if (!STATUS.includes(input.status)) return { error: "Status inválido." };
  const comentario = input.comentario?.trim() || null;
  if (input.status === "NAO_SE_APLICA" && !comentario) return { error: "Diga por que não se aplica." };

  const supabase = await createClient();
  const { data: antes, error: e1 } = await supabase.from("tarefas").select("id, status").in("id", input.ids);
  if (e1) return { error: e1.message };
  const concluida = input.status === "CONCLUIDA";
  const { error } = await supabase
    .from("tarefas")
    .update({
      status: input.status,
      concluida_em: concluida ? new Date().toISOString() : null,
      concluida_por: concluida ? user.id : null,
      ...(comentario ? { comentario } : {}),
    })
    .in("id", input.ids);
  if (error) return { error: error.message };
  const eventos = (antes ?? [])
    .filter((t) => t.status !== input.status)
    .map((t) => ({ tarefa_id: t.id, user_id: user.id, tipo: "STATUS", de: t.status, para: input.status, comentario }));
  if (eventos.length) await supabase.from("tarefa_eventos").insert(eventos);
  revalidar();
  return { ok: true };
}

export async function reatribuirTarefasAction(input: { ids: string[]; responsavelId: string | null }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!input.ids.length) return { error: "Nenhuma tarefa selecionada." };
  const supabase = await createClient();
  const { data: antes } = await supabase.from("tarefas").select("id, responsavel_id").in("id", input.ids);
  const { error } = await supabase.from("tarefas").update({ responsavel_id: input.responsavelId }).in("id", input.ids);
  if (error) return { error: error.message };
  const eventos = (antes ?? [])
    .filter((t) => t.responsavel_id !== input.responsavelId)
    .map((t) => ({ tarefa_id: t.id, user_id: user.id, tipo: "RESPONSAVEL", de: t.responsavel_id, para: input.responsavelId }));
  if (eventos.length) await supabase.from("tarefa_eventos").insert(eventos);
  revalidar();
  return { ok: true };
}

export async function comentarTarefaAction(input: { id: string; comentario: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const comentario = input.comentario.trim();
  if (!comentario) return { error: "Escreva o comentário." };
  const supabase = await createClient();
  const { error } = await supabase.from("tarefas").update({ comentario }).eq("id", input.id);
  if (error) return { error: error.message };
  await supabase.from("tarefa_eventos").insert({ tarefa_id: input.id, user_id: user.id, tipo: "COMENTARIO", comentario });
  revalidar();
  return { ok: true };
}

/** Botão "Gerar agora" (Configurações › Modelos): mesma rotina do cron. */
export async function gerarTarefasAction(input: { competencia: string; modeloIds?: string[] }): Promise<Resultado> {
  await requireSuperAdmin();
  if (!COMPETENCIA.test(input.competencia)) return { error: "Competência inválida." };
  try {
    const r = await gerarTarefas(await createClient(), input.competencia, { modeloIds: input.modeloIds });
    revalidar();
    return {
      ok: true,
      mensagem: r.modelos
        ? `${r.criadas} tarefa(s) criada(s) de ${r.modelos} modelo(s); ${r.prazosAtualizados} prazo(s) atualizado(s).`
        : "Nenhum modelo ativo gera nessa competência.",
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------- modelos

export type ModeloInput = {
  id: string | null;
  nome: string;
  descricao: string | null;
  departamento_id: string;
  periodicidade: "MENSAL" | "TRIMESTRAL" | "ANUAL";
  meses: number[] | null;
  prazo_tipo: "AGENDA" | "DIA_FIXO";
  agenda_chave: string | null;
  dia_prazo: number | null;
  dia_meta: number | null;
  mes_prazo_offset: number;
  aplica_regimes: string[] | null;
  aplica_pessoa: "PF" | "PJ" | null;
  aplica_municipios: string[] | null;
  aplica_folha: boolean | null;
  fonte_automatica: string | null;
  ativo: boolean;
  ordem: number;
};

function validarModelo(m: ModeloInput): string | null {
  if (!m.nome.trim()) return "Dê um nome à tarefa.";
  if (!m.departamento_id) return "Escolha o departamento.";
  if (m.prazo_tipo === "AGENDA" && !m.agenda_chave) return "Escolha a obrigação da agenda.";
  if (m.prazo_tipo === "DIA_FIXO" && !(m.dia_prazo && m.dia_prazo >= 1 && m.dia_prazo <= 31))
    return "Informe o dia do prazo (1 a 31).";
  if (m.dia_meta != null && !(m.dia_meta >= 1 && m.dia_meta <= 31)) return "Dia da meta deve ser de 1 a 31.";
  if (!(m.mes_prazo_offset >= 0 && m.mes_prazo_offset <= 12)) return "Mês do prazo inválido.";
  if (m.periodicidade !== "MENSAL" && m.meses?.some((x) => x < 1 || x > 12)) return "Meses inválidos.";
  return null;
}

export async function salvarModeloAction(m: ModeloInput): Promise<Resultado & { id?: string }> {
  await requireSuperAdmin();
  const erro = validarModelo(m);
  if (erro) return { error: erro };
  const supabase = await createClient();
  const linha = {
    nome: m.nome.trim(),
    descricao: m.descricao?.trim() || null,
    departamento_id: m.departamento_id,
    periodicidade: m.periodicidade,
    meses: m.periodicidade === "MENSAL" ? null : m.meses?.length ? m.meses : null,
    prazo_tipo: m.prazo_tipo,
    agenda_chave: m.prazo_tipo === "AGENDA" ? m.agenda_chave : null,
    dia_prazo: m.prazo_tipo === "DIA_FIXO" ? m.dia_prazo : null,
    dia_meta: m.dia_meta,
    mes_prazo_offset: m.mes_prazo_offset,
    aplica_regimes: m.aplica_regimes?.length ? m.aplica_regimes : null,
    aplica_pessoa: m.aplica_pessoa,
    aplica_municipios: m.aplica_municipios?.length ? m.aplica_municipios : null,
    aplica_folha: m.aplica_folha,
    fonte_automatica: m.fonte_automatica || null,
    ativo: m.ativo,
    ordem: m.ordem,
  };
  const r = m.id
    ? await supabase.from("tarefa_modelos").update(linha).eq("id", m.id).select("id").single()
    : await supabase.from("tarefa_modelos").insert(linha).select("id").single();
  if (r.error) return { error: r.error.message };
  revalidatePath("/admin/configuracoes/tarefa-modelos", "layout");
  return { ok: true, id: r.data.id as string };
}

/** Só apaga modelo sem tarefa gerada; com histórico, desative. */
export async function excluirModeloAction(id: string): Promise<Resultado> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { count } = await supabase.from("tarefas").select("id", { count: "exact", head: true }).eq("modelo_id", id);
  if (count) return { error: `Esse modelo já gerou ${count} tarefa(s) — desative em vez de excluir.` };
  const { error } = await supabase.from("tarefa_modelos").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/configuracoes/tarefa-modelos", "layout");
  return { ok: true };
}

export async function salvarExcecaoAction(input: {
  modeloId: string;
  companyId: string;
  tipo: "INCLUIR" | "EXCLUIR" | null;
}): Promise<Resultado> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = input.tipo
    ? await supabase
        .from("tarefa_modelo_excecoes")
        .upsert({ modelo_id: input.modeloId, company_id: input.companyId, tipo: input.tipo })
    : await supabase
        .from("tarefa_modelo_excecoes")
        .delete()
        .eq("modelo_id", input.modeloId)
        .eq("company_id", input.companyId);
  if (error) return { error: error.message };
  revalidatePath("/admin/configuracoes/tarefa-modelos", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------- carteira

/**
 * Define o responsável da empresa no departamento e passa para ele as
 * tarefas ABERTAS daquela empresa/departamento (concluídas ficam como estão).
 */
export async function salvarResponsavelAction(input: {
  companyId: string;
  departamentoId: string;
  userId: string | null;
}): Promise<Resultado> {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = input.userId
    ? await supabase.from("tarefa_responsaveis").upsert({
        company_id: input.companyId,
        departamento_id: input.departamentoId,
        user_id: input.userId,
        atualizado_em: new Date().toISOString(),
      })
    : await supabase
        .from("tarefa_responsaveis")
        .delete()
        .eq("company_id", input.companyId)
        .eq("departamento_id", input.departamentoId);
  if (error) return { error: error.message };
  const { error: e2 } = await supabase
    .from("tarefas")
    .update({ responsavel_id: input.userId })
    .eq("company_id", input.companyId)
    .eq("departamento_id", input.departamentoId)
    .in("status", ["A_FAZER", "EM_ANDAMENTO"]);
  if (e2) return { error: e2.message };
  revalidatePath("/admin/configuracoes/carteira");
  revalidar();
  return { ok: true };
}

/** Mesmo que salvarResponsavelAction, para várias empresas de uma vez. */
export async function salvarResponsaveisEmLoteAction(input: {
  companyIds: string[];
  departamentoId: string;
  userId: string | null;
}): Promise<Resultado> {
  await requireSuperAdmin();
  if (!input.companyIds.length) return { error: "Nenhuma empresa." };
  const supabase = await createClient();
  for (let i = 0; i < input.companyIds.length; i += 200) {
    const ids = input.companyIds.slice(i, i + 200);
    const { error } = input.userId
      ? await supabase.from("tarefa_responsaveis").upsert(
          ids.map((company_id) => ({
            company_id,
            departamento_id: input.departamentoId,
            user_id: input.userId,
            atualizado_em: new Date().toISOString(),
          })),
        )
      : await supabase.from("tarefa_responsaveis").delete().eq("departamento_id", input.departamentoId).in("company_id", ids);
    if (error) return { error: error.message };
    const { error: e2 } = await supabase
      .from("tarefas")
      .update({ responsavel_id: input.userId })
      .eq("departamento_id", input.departamentoId)
      .in("company_id", ids)
      .in("status", ["A_FAZER", "EM_ANDAMENTO"]);
    if (e2) return { error: e2.message };
  }
  revalidatePath("/admin/configuracoes/carteira");
  revalidar();
  return { ok: true, mensagem: `${input.companyIds.length} empresa(s) atualizada(s).` };
}

// ----------------------------------------------------------- etapas (Fase 2)

export type EtapaTarefa = {
  etapa_id: string;
  ordem: number;
  nome: string;
  departamento: string | null;
  depende_do_cliente: boolean;
  fonte: string | null;
  concluida_em: string | null;
  automatica: boolean;
};

/** Checklist de uma tarefa (aberto sob demanda nas telas). */
export async function etapasDaTarefaAction(tarefaId: string): Promise<{ etapas: EtapaTarefa[] } | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefa_etapas")
    .select(
      "etapa_id, concluida_em, automatica, tarefa_modelo_etapas(ordem, nome, depende_do_cliente, fonte_automatica, atendimento_departamentos(nome))",
    )
    .eq("tarefa_id", tarefaId);
  if (error) return { error: error.message };
  type Linha = {
    etapa_id: string;
    concluida_em: string | null;
    automatica: boolean;
    tarefa_modelo_etapas: {
      ordem: number;
      nome: string;
      depende_do_cliente: boolean;
      fonte_automatica: string | null;
      atendimento_departamentos: { nome: string } | null;
    } | null;
  };
  const etapas = ((data ?? []) as unknown as Linha[])
    .filter((l) => l.tarefa_modelo_etapas)
    .map((l) => {
      const d = l.tarefa_modelo_etapas!;
      return {
        etapa_id: l.etapa_id,
        ordem: d.ordem,
        nome: d.nome,
        departamento: d.atendimento_departamentos?.nome ?? null,
        depende_do_cliente: d.depende_do_cliente,
        fonte: d.fonte_automatica ? (FONTES_ROTULO[d.fonte_automatica as keyof typeof FONTES_ROTULO] ?? null) : null,
        concluida_em: l.concluida_em,
        automatica: l.automatica,
      };
    })
    .sort((a, b) => a.ordem - b.ordem);
  return { etapas };
}

/** Marca/desmarca uma etapa; a tarefa avança (ou volta) e a cascata troca o dono. */
export async function marcarEtapaAction(input: { tarefaId: string; etapaId: string; feita: boolean }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("tarefa_etapas")
    .update(
      input.feita
        ? { concluida_em: new Date().toISOString(), concluida_por: user.id, automatica: false }
        : { concluida_em: null, concluida_por: null, automatica: false },
    )
    .eq("tarefa_id", input.tarefaId)
    .eq("etapa_id", input.etapaId);
  if (error) return { error: error.message };
  await supabase.from("tarefa_eventos").insert({
    tarefa_id: input.tarefaId,
    user_id: user.id,
    tipo: "ETAPA",
    para: input.feita ? "FEITA" : "DESFEITA",
    comentario: input.etapaId,
  });
  try {
    await recalcularTarefas(supabase, [input.tarefaId], { reabrir: !input.feita });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidar();
  return { ok: true };
}

/**
 * Kanban: coloca a tarefa na coluna da etapa `ordem` (todas as anteriores
 * feitas, ela e as seguintes pendentes); `ordem` null = todas feitas.
 */
export async function moverTarefaParaEtapaAction(input: { tarefaId: string; ordem: number | null }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tarefa_etapas")
    .select("etapa_id, concluida_em, tarefa_modelo_etapas(ordem)")
    .eq("tarefa_id", input.tarefaId);
  if (error) return { error: error.message };
  const agora = new Date().toISOString();
  let voltou = false;
  type Linha = { etapa_id: string; concluida_em: string | null; tarefa_modelo_etapas: { ordem: number } | null };
  for (const l of (data ?? []) as unknown as Linha[]) {
    const ordem = l.tarefa_modelo_etapas?.ordem ?? 0;
    const deveEstarFeita = input.ordem == null || ordem < input.ordem;
    if (deveEstarFeita === !!l.concluida_em) continue;
    if (!deveEstarFeita) voltou = true;
    const { error: e2 } = await supabase
      .from("tarefa_etapas")
      .update(
        deveEstarFeita
          ? { concluida_em: agora, concluida_por: user.id, automatica: false }
          : { concluida_em: null, concluida_por: null, automatica: false },
      )
      .eq("tarefa_id", input.tarefaId)
      .eq("etapa_id", l.etapa_id);
    if (e2) return { error: e2.message };
  }
  await supabase.from("tarefa_eventos").insert({
    tarefa_id: input.tarefaId,
    user_id: user.id,
    tipo: "ETAPA",
    para: input.ordem == null ? "FIM" : `ETAPA ${input.ordem}`,
  });
  try {
    await recalcularTarefas(supabase, [input.tarefaId], { reabrir: voltou });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidar();
  return { ok: true };
}

/** Botão "Sincronizar" e a sincronização ao abrir a tela de Tarefas. */
export async function sincronizarTarefasAction(): Promise<Resultado> {
  await requireSomaStaff();
  try {
    const r = await sincronizarAutomacoes(await createClient());
    if (r.tarefas || r.etapas) revalidar();
    return { ok: true, mensagem: `${r.tarefas} tarefa(s) e ${r.etapas} etapa(s) concluídas pelas centrais.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export type EtapaModeloInput = {
  id: string | null;
  nome: string;
  departamento_id: string | null;
  fonte_automatica: string | null;
  depende_do_cliente: boolean;
};

/** Substitui as etapas do modelo (na ordem da lista) e ajusta as tarefas abertas. */
export async function salvarEtapasModeloAction(input: { modeloId: string; etapas: EtapaModeloInput[] }): Promise<Resultado> {
  await requireSuperAdmin();
  if (input.etapas.some((e) => !e.nome.trim())) return { error: "Toda etapa precisa de nome." };
  if (input.etapas.some((e) => e.fonte_automatica && !(e.fonte_automatica in FONTES_ROTULO)))
    return { error: "Fonte automática inválida." };
  const supabase = await createClient();
  const { data: atuais, error: e1 } = await supabase.from("tarefa_modelo_etapas").select("id").eq("modelo_id", input.modeloId);
  if (e1) return { error: e1.message };
  const manter = new Set(input.etapas.map((e) => e.id).filter(Boolean) as string[]);
  const remover = (atuais ?? []).map((a) => a.id as string).filter((id) => !manter.has(id));
  if (remover.length) {
    const { error } = await supabase.from("tarefa_modelo_etapas").delete().in("id", remover);
    if (error) return { error: error.message };
  }
  for (const [i, e] of input.etapas.entries()) {
    const linha = {
      modelo_id: input.modeloId,
      ordem: i + 1,
      nome: e.nome.trim(),
      departamento_id: e.departamento_id || null,
      fonte_automatica: e.fonte_automatica || null,
      depende_do_cliente: e.depende_do_cliente,
    };
    const { error } = e.id
      ? await supabase.from("tarefa_modelo_etapas").update(linha).eq("id", e.id)
      : await supabase.from("tarefa_modelo_etapas").insert(linha);
    if (error) return { error: error.message };
  }
  // Tarefas abertas desse modelo: criar as etapas novas e recalcular.
  const { data: abertas } = await supabase
    .from("tarefas")
    .select("id, competencia")
    .eq("modelo_id", input.modeloId)
    .in("status", ["A_FAZER", "EM_ANDAMENTO"])
    .limit(5000);
  try {
    for (const c of new Set((abertas ?? []).map((t) => t.competencia as string))) await garantirEtapas(supabase, c);
    if (abertas?.length) {
      if (!input.etapas.length) {
        await supabase
          .from("tarefas")
          .update({ etapa_atual: null, aguardando_cliente: false })
          .eq("modelo_id", input.modeloId)
          .in("status", ["A_FAZER", "EM_ANDAMENTO"]);
      } else {
        await recalcularTarefas(supabase, abertas.map((t) => t.id as string));
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/admin/configuracoes/tarefa-modelos", "layout");
  revalidar();
  return { ok: true, mensagem: `${input.etapas.length} etapa(s) salva(s).` };
}
