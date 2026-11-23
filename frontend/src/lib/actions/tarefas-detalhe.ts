"use server";

// Tarefas — painel lateral (detalhe, comentários, histórico, anexos) e
// tarefa avulsa. Pedido de 24/11/2026.

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { listarEquipe, nomeEmpresa } from "@/lib/tarefas";
import { STATUS_ROTULO, type StatusTarefa } from "@/lib/tarefas-comum";

type Resultado = { ok: true; mensagem?: string } | { error: string };

function revalidar() {
  revalidatePath("/admin/tarefas", "layout");
  revalidatePath("/admin");
}

export type EventoTarefa = { id: string; quando: string; quem: string | null; texto: string; comentario: boolean };
export type AnexoTarefa = { id: string; nome: string; quando: string; quem: string | null };

export type DetalheTarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  avulsa: boolean;
  empresa: string;
  company_id: string;
  competencia: string;
  departamento: string;
  responsavel_id: string | null;
  eventos: EventoTarefa[];
  anexos: AnexoTarefa[];
  equipe: { id: string; nome: string }[];
};

function textoEvento(e: { tipo: string; de: string | null; para: string | null; comentario: string | null }, nome: (id: string | null) => string): string {
  const st = (v: string | null) => (v && v in STATUS_ROTULO ? STATUS_ROTULO[v as StatusTarefa] : v ?? "—");
  switch (e.tipo) {
    case "STATUS":
      return `Status: ${st(e.de)} → ${st(e.para)}${e.comentario ? ` (${e.comentario})` : ""}`;
    case "RESPONSAVEL":
      return `Responsável: ${nome(e.de)} → ${nome(e.para)}`;
    case "ETAPA":
      return e.para === "FEITA" ? "Etapa concluída" : e.para === "DESFEITA" ? "Etapa desmarcada" : `Movida no quadro (${e.para})`;
    case "AUTOMATICO":
      return `Concluída pela central: ${e.comentario ?? ""}`;
    case "VERIFICACAO":
      return `Pagamento verificado: ${e.comentario ?? ""} — tarefa concluída`;
    case "ANEXO":
      return `Anexo: ${e.comentario ?? ""}`;
    case "CRIADA":
      return "Tarefa avulsa criada";
    default:
      return e.tipo;
  }
}

export async function detalheTarefaAction(tarefaId: string): Promise<DetalheTarefa | { error: string }> {
  await requireSomaStaff();
  const supabase = await createClient();
  const [{ data: t, error }, { data: eventos }, { data: anexos }, equipe] = await Promise.all([
    supabase
      .from("tarefas")
      .select(
        "id, titulo, descricao, modelo_id, company_id, competencia, responsavel_id, tarefa_modelos(nome, descricao), companies(legal_name, trade_name, codigo_cliente), atendimento_departamentos(nome)",
      )
      .eq("id", tarefaId)
      .maybeSingle(),
    supabase.from("tarefa_eventos").select("id, user_id, tipo, de, para, comentario, created_at").eq("tarefa_id", tarefaId).order("created_at", { ascending: false }).limit(200),
    supabase.from("tarefa_anexos").select("id, nome_arquivo, enviado_por, created_at").eq("tarefa_id", tarefaId).order("created_at"),
    listarEquipe(),
  ]);
  if (error) return { error: error.message };
  if (!t) return { error: "Tarefa não encontrada." };
  type T = {
    id: string;
    titulo: string | null;
    descricao: string | null;
    modelo_id: string | null;
    company_id: string;
    competencia: string;
    responsavel_id: string | null;
    tarefa_modelos: { nome: string; descricao: string | null } | null;
    companies: { legal_name: string; trade_name: string | null; codigo_cliente: string | null } | null;
    atendimento_departamentos: { nome: string } | null;
  };
  const tt = t as unknown as T;
  const nomes = new Map(equipe.map((u) => [u.id, u.nome]));
  const nome = (id: string | null) => (id ? nomes.get(id) ?? "—" : "ninguém");
  return {
    id: tt.id,
    titulo: tt.titulo ?? tt.tarefa_modelos?.nome ?? "—",
    descricao: tt.descricao ?? tt.tarefa_modelos?.descricao ?? null,
    avulsa: !tt.modelo_id,
    empresa: tt.companies ? nomeEmpresa(tt.companies) : "—",
    company_id: tt.company_id,
    competencia: tt.competencia,
    departamento: tt.atendimento_departamentos?.nome ?? "—",
    responsavel_id: tt.responsavel_id,
    equipe,
    eventos: (eventos ?? []).map((e) => ({
      id: e.id as string,
      quando: e.created_at as string,
      quem: e.user_id ? nome(e.user_id as string) : null,
      comentario: e.tipo === "COMENTARIO",
      texto: e.tipo === "COMENTARIO" ? (e.comentario as string) : textoEvento(e as never, nome),
    })),
    anexos: (anexos ?? []).map((a) => ({
      id: a.id as string,
      nome: a.nome_arquivo as string,
      quando: a.created_at as string,
      quem: a.enviado_por ? nome(a.enviado_por as string) : null,
    })),
  };
}

/** Comentário entra no histórico (não sobrescreve nada). */
export async function comentarAction(input: { tarefaId: string; texto: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const texto = input.texto.trim();
  if (!texto) return { error: "Escreva o comentário." };
  const supabase = await createClient();
  const { error } = await supabase.from("tarefa_eventos").insert({ tarefa_id: input.tarefaId, user_id: user.id, tipo: "COMENTARIO", comentario: texto.slice(0, 4000) });
  if (error) return { error: error.message };
  await supabase.from("tarefas").update({ comentario: texto.slice(0, 300) }).eq("id", input.tarefaId);
  revalidar();
  return { ok: true };
}

export async function salvarAnexoTarefaAction(input: { tarefaId: string; blobUrl: string; blobPathname: string; nome: string }): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!input.blobPathname.startsWith(`tarefas/${input.tarefaId}/`)) return { error: "Arquivo inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("tarefa_anexos").insert({
    tarefa_id: input.tarefaId,
    nome_arquivo: input.nome.slice(0, 200),
    blob_url: input.blobUrl,
    blob_pathname: input.blobPathname,
    enviado_por: user.id,
  });
  if (error) {
    await del(input.blobPathname).catch(() => {});
    return { error: error.message };
  }
  await supabase.from("tarefa_eventos").insert({ tarefa_id: input.tarefaId, user_id: user.id, tipo: "ANEXO", comentario: input.nome.slice(0, 200) });
  return { ok: true };
}

export async function apagarAnexoTarefaAction(anexoId: string): Promise<Resultado> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: a } = await supabase.from("tarefa_anexos").select("blob_pathname").eq("id", anexoId).maybeSingle();
  if (!a) return { error: "Anexo não encontrado." };
  const { error } = await supabase.from("tarefa_anexos").delete().eq("id", anexoId);
  if (error) return { error: error.message };
  await del(a.blob_pathname as string).catch(() => {});
  return { ok: true };
}

// ------------------------------------------------------------ tarefa avulsa

export type OpcoesAvulsa = {
  empresas: { id: string; nome: string }[];
  departamentos: { id: string; nome: string }[];
  equipe: { id: string; nome: string }[];
};

export async function opcoesTarefaAvulsaAction(): Promise<OpcoesAvulsa> {
  await requireSomaStaff();
  const supabase = await createClient();
  const [{ data: empresas }, { data: deptos }, equipe] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name, codigo_cliente").eq("ativa", true).order("legal_name").limit(2000),
    supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
    listarEquipe(),
  ]);
  return {
    empresas: (empresas ?? [])
      .map((e) => ({ id: e.id as string, nome: nomeEmpresa(e as { legal_name: string; trade_name: string | null; codigo_cliente: string | null }) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    departamentos: (deptos ?? []) as { id: string; nome: string }[],
    equipe,
  };
}

export async function criarTarefaAvulsaAction(input: {
  companyId: string;
  titulo: string;
  descricao: string | null;
  departamentoId: string;
  responsavelId: string | null;
  prazo: string; // YYYY-MM-DD
  prazoLegal: string | null;
}): Promise<Resultado> {
  await requireSomaStaff();
  const user = await requireUser();
  const titulo = input.titulo.trim();
  if (!titulo) return { error: "Dê um título à tarefa." };
  if (!input.companyId) return { error: "Escolha a empresa." };
  if (!input.departamentoId) return { error: "Escolha o departamento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.prazo)) return { error: "Informe o prazo." };
  if (input.prazoLegal && !/^\d{4}-\d{2}-\d{2}$/.test(input.prazoLegal)) return { error: "Prazo legal inválido." };
  const supabase = await createClient();
  let responsavel = input.responsavelId;
  if (!responsavel) {
    const { data } = await supabase
      .from("tarefa_responsaveis")
      .select("user_id")
      .eq("company_id", input.companyId)
      .eq("departamento_id", input.departamentoId)
      .maybeSingle();
    responsavel = (data?.user_id as string | undefined) ?? null;
  }
  const { data, error } = await supabase
    .from("tarefas")
    .insert({
      modelo_id: null,
      titulo: titulo.slice(0, 200),
      descricao: input.descricao?.trim() || null,
      company_id: input.companyId,
      competencia: input.prazo.slice(0, 7),
      departamento_id: input.departamentoId,
      responsavel_id: responsavel,
      prazo_meta: input.prazo,
      prazo_legal: input.prazoLegal || input.prazo,
      criada_por: user.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await supabase.from("tarefa_eventos").insert({ tarefa_id: data.id, user_id: user.id, tipo: "CRIADA" });
  revalidar();
  return { ok: true, mensagem: "Tarefa criada." };
}
