"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireUser, isSomaStaff, temPermissao } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { buscarDadosCnpj, type DadosCnpj } from "@/lib/cnpj-lookup";
import { criarEmpresaComOrganizacao } from "@/lib/actions/empresas";
import { inativarEmpresa } from "@/lib/actions/empresas";
import type { ActionState } from "@/lib/actions/auth";

const ALTERACAO_ITENS_VALIDOS = [
  "SOCIOS",
  "CESSAO_COTAS",
  "ADMINISTRACAO",
  "DENOMINACAO",
  "ATIVIDADE",
  "ENDERECO",
  "CAPITAL_SOCIAL",
  "OUTRO",
] as const;

export async function buscarCnpjParaProcesso(
  cnpj: string,
): Promise<{ data: DadosCnpj } | { error: string }> {
  await requirePermissao("legalizacao.editar");
  const digits = cnpj.replace(/\D/g, "");
  return buscarDadosCnpj(digits);
}

// ---------------------------------------------------------------------------
// Criar / editar processo
// ---------------------------------------------------------------------------
const criarProcessoSchema = z.object({
  tipoProcesso: z.enum(["ABERTURA", "ALTERACAO", "ENCERRAMENTO"]),
  fluxoId: uuidLike,
  nome: z.string().trim().optional(),
  companyId: uuidLike.optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de início."),
  prazoFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  responsavelId: uuidLike.optional().or(z.literal("")),
  detalhes: z.string().trim().optional(),
  contatoNome: z.string().trim().optional(),
  contatoEmail: z.string().trim().optional(),
  contatoWhatsapp: z.string().trim().optional(),
  alteracaoItens: z.array(z.enum(ALTERACAO_ITENS_VALIDOS)).optional(),
});

export type CriarProcessoInput = {
  tipoProcesso: "ABERTURA" | "ALTERACAO" | "ENCERRAMENTO";
  fluxoId: string;
  nome?: string;
  companyId?: string;
  cnpj?: string;
  dataInicio: string;
  prazoFinal?: string;
  responsavelId?: string;
  detalhes?: string;
  contatoNome?: string;
  contatoEmail?: string;
  contatoWhatsapp?: string;
  alteracaoItens?: string[];
};

// Miolo de criação de processo (registro + snapshot de fases), sem
// FormData/redirect — reaproveitado tanto pelo form de "Novo processo" do
// próprio módulo Legalização quanto por outros módulos que precisam abrir um
// processo por código (ex.: Comercial, ao iniciar a abertura de um
// prospect). Aceita um client opcional porque quem chama de fora do módulo
// (ex.: comercial.editar) não necessariamente tem legalizacao.editar — a
// RLS de legalizacao_processos/legalizacao_fluxos bloquearia o client
// normal, então nesse caso o chamador passa um client admin (service role)
// já tendo verificado a própria permissão (comercial.editar) antes.
export async function criarProcessoLegalizacaoCore(
  input: CriarProcessoInput,
  criadoPor: string,
  supabaseClient?: SupabaseClient,
): Promise<{ processoId: string } | { error: string }> {
  if (input.tipoProcesso !== "ABERTURA" && !input.companyId) {
    return { error: "Selecione uma empresa existente." };
  }
  if (input.tipoProcesso === "ABERTURA" && (!input.nome || input.nome.length < 2)) {
    return { error: "Informe o nome do negócio." };
  }

  const supabase = supabaseClient ?? (await createClient());

  // Alteração/Encerramento nascem numa empresa já existente — o nome do
  // processo é o da própria empresa, não precisa ser digitado de novo.
  let nomeProcesso = input.nome ?? "";
  if (input.tipoProcesso !== "ABERTURA" && input.companyId) {
    const { data: empresa } = await supabase
      .from("companies")
      .select("legal_name, trade_name")
      .eq("id", input.companyId)
      .single();
    if (!empresa) return { error: "Empresa não encontrada." };
    nomeProcesso = empresa.trade_name || empresa.legal_name;
  }

  const { data: fluxo } = await supabase
    .from("legalizacao_fluxos")
    .select("id, nome, tipo_processo")
    .eq("id", input.fluxoId)
    .single();
  if (!fluxo) return { error: "Fluxo não encontrado." };
  if (fluxo.tipo_processo !== input.tipoProcesso) {
    return { error: "Esse fluxo não corresponde ao tipo de processo selecionado." };
  }

  const { data: templateFases } = await supabase
    .from("legalizacao_fluxo_fases_template")
    .select("nome, ordem, descricao, acao, tipo_documento_id")
    .eq("fluxo_id", fluxo.id)
    .eq("ativo", true)
    .order("ordem", { ascending: true });
  if (!templateFases || templateFases.length === 0) {
    return { error: "Esse fluxo não tem nenhuma fase configurada." };
  }

  const { data: processo, error } = await supabase
    .from("legalizacao_processos")
    .insert({
      tipo_processo: input.tipoProcesso,
      fluxo_id: fluxo.id,
      fluxo_nome: fluxo.nome,
      nome: nomeProcesso,
      company_id: input.companyId || null,
      cnpj: input.tipoProcesso === "ABERTURA" ? input.cnpj || null : null,
      data_inicio: input.dataInicio,
      prazo_final: input.prazoFinal || null,
      responsavel_id: input.responsavelId || null,
      detalhes: input.detalhes || null,
      contato_nome: input.contatoNome || null,
      contato_email: input.contatoEmail || null,
      contato_whatsapp: input.contatoWhatsapp || null,
      alteracao_itens: input.tipoProcesso === "ALTERACAO" ? input.alteracaoItens ?? [] : [],
      criado_por: criadoPor,
    })
    .select("id")
    .single();
  if (error || !processo) {
    return { error: "Não foi possível criar o processo." };
  }

  const linhas = templateFases.map((f) => ({
    processo_id: processo.id,
    nome: f.nome,
    ordem: f.ordem,
    descricao: f.descricao,
    acao: f.acao,
    tipo_documento_id: f.tipo_documento_id,
  }));
  const { error: fasesError } = await supabase.from("legalizacao_processo_fases").insert(linhas);
  if (fasesError) {
    // Compensa: sem o snapshot de fases o processo fica inconsistente.
    await supabase.from("legalizacao_processos").delete().eq("id", processo.id);
    return { error: "Não foi possível criar as fases do processo." };
  }

  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: processo.id,
    tipo: "SISTEMA",
    autor_id: criadoPor,
    corpo: `Processo criado — fluxo "${fluxo.nome}".`,
  });

  revalidatePath("/legalizacao/processos");
  if (input.companyId) revalidatePath(`/legalizacao/empresas/${input.companyId}`);
  return { processoId: processo.id };
}

export async function criarProcesso(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");

  const parsed = criarProcessoSchema.safeParse({
    tipoProcesso: formData.get("tipoProcesso"),
    fluxoId: formData.get("fluxoId"),
    nome: formData.get("nome") || undefined,
    companyId: formData.get("companyId") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    dataInicio: formData.get("dataInicio"),
    prazoFinal: formData.get("prazoFinal") || undefined,
    responsavelId: formData.get("responsavelId") || undefined,
    detalhes: formData.get("detalhes") || undefined,
    contatoNome: formData.get("contatoNome") || undefined,
    contatoEmail: formData.get("contatoEmail") || undefined,
    contatoWhatsapp: formData.get("contatoWhatsapp") || undefined,
    alteracaoItens: formData.getAll("alteracaoItens"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const resultado = await criarProcessoLegalizacaoCore(parsed.data, user.id);
  if ("error" in resultado) return { error: resultado.error };

  redirect(`/legalizacao/processos/${resultado.processoId}`);
}

const editarProcessoSchema = z.object({
  processoId: uuidLike,
  nome: z.string().trim().min(2, "Informe o nome."),
  prazoFinal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  responsavelId: uuidLike.optional().or(z.literal("")),
  detalhes: z.string().trim().optional(),
  contatoNome: z.string().trim().optional(),
  contatoEmail: z.string().trim().optional(),
  contatoWhatsapp: z.string().trim().optional(),
  alteracaoItens: z.array(z.enum(ALTERACAO_ITENS_VALIDOS)).optional(),
});

export async function editarProcesso(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");

  const parsed = editarProcessoSchema.safeParse({
    processoId: formData.get("processoId"),
    nome: formData.get("nome"),
    prazoFinal: formData.get("prazoFinal") || undefined,
    responsavelId: formData.get("responsavelId") || undefined,
    detalhes: formData.get("detalhes") || undefined,
    contatoNome: formData.get("contatoNome") || undefined,
    contatoEmail: formData.get("contatoEmail") || undefined,
    contatoWhatsapp: formData.get("contatoWhatsapp") || undefined,
    alteracaoItens: formData.getAll("alteracaoItens"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { processoId, ...rest } = parsed.data;

  const supabase = await createClient();
  const { data: processoAtual } = await supabase
    .from("legalizacao_processos")
    .select("tipo_processo, responsavel_id, prazo_final")
    .eq("id", processoId)
    .single();
  if (!processoAtual) return { error: "Processo não encontrado." };

  const user = await requireUser();
  const { error } = await supabase
    .from("legalizacao_processos")
    .update({
      nome: rest.nome,
      prazo_final: rest.prazoFinal || null,
      responsavel_id: rest.responsavelId || null,
      detalhes: rest.detalhes || null,
      contato_nome: rest.contatoNome || null,
      contato_email: rest.contatoEmail || null,
      contato_whatsapp: rest.contatoWhatsapp || null,
      alteracao_itens: processoAtual.tipo_processo === "ALTERACAO" ? rest.alteracaoItens ?? [] : [],
    })
    .eq("id", processoId);
  if (error) return { error: "Não foi possível salvar." };

  if (processoAtual.responsavel_id !== (rest.responsavelId || null)) {
    await supabase.from("legalizacao_processo_historico").insert({
      processo_id: processoId,
      campo: "RESPONSAVEL_PROCESSO",
      de_valor: processoAtual.responsavel_id,
      para_valor: rest.responsavelId || null,
      user_id: user.id,
    });
  }
  if (processoAtual.prazo_final !== (rest.prazoFinal || null)) {
    await supabase.from("legalizacao_processo_historico").insert({
      processo_id: processoId,
      campo: "PRAZO_FINAL",
      de_valor: processoAtual.prazo_final,
      para_valor: rest.prazoFinal || null,
      user_id: user.id,
    });
  }

  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/processos");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Fases — status, prazo, responsável, conclusão/reabertura.
// ---------------------------------------------------------------------------
export async function definirStatusFase(
  faseId: string,
  processoId: string,
  statusManual: "AGUARDANDO_DADOS" | "A_CONFERIR" | "PARALISADO" | null,
) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: fase } = await supabase
    .from("legalizacao_processo_fases")
    .select("nome, status_manual, data_conclusao")
    .eq("id", faseId)
    .single();
  if (!fase) throw new Error("Fase não encontrada.");
  if (fase.data_conclusao) throw new Error("Fase já concluída — reabra antes de mudar o status.");

  const { error } = await supabase
    .from("legalizacao_processo_fases")
    .update({ status_manual: statusManual })
    .eq("id", faseId);
  if (error) throw new Error("Não foi possível atualizar o status.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_id: faseId,
    fase_nome: fase.nome,
    campo: "STATUS_FASE",
    de_valor: fase.status_manual,
    para_valor: statusManual,
    user_id: user.id,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/processos");
}

export async function definirResponsavelFase(faseId: string, processoId: string, responsavelId: string | null) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: fase } = await supabase
    .from("legalizacao_processo_fases")
    .select("nome, responsavel_id")
    .eq("id", faseId)
    .single();
  if (!fase) throw new Error("Fase não encontrada.");

  const { error } = await supabase
    .from("legalizacao_processo_fases")
    .update({ responsavel_id: responsavelId })
    .eq("id", faseId);
  if (error) throw new Error("Não foi possível atualizar o responsável.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_id: faseId,
    fase_nome: fase.nome,
    campo: "RESPONSAVEL_FASE",
    de_valor: fase.responsavel_id,
    para_valor: responsavelId,
    user_id: user.id,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function definirPrazoFase(faseId: string, processoId: string, prazo: string | null) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: fase } = await supabase
    .from("legalizacao_processo_fases")
    .select("nome, prazo")
    .eq("id", faseId)
    .single();
  if (!fase) throw new Error("Fase não encontrada.");

  const { error } = await supabase.from("legalizacao_processo_fases").update({ prazo }).eq("id", faseId);
  if (error) throw new Error("Não foi possível atualizar o prazo.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_id: faseId,
    fase_nome: fase.nome,
    campo: "PRAZO_FASE",
    de_valor: fase.prazo,
    para_valor: prazo,
    user_id: user.id,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export type ConcluirFaseResult = { redirectTo?: string } | { error: string } | undefined;

// Recusa concluir a fase CRIAR_EMPRESA sem empresa vinculada — a UI manda
// pra tela de cadastro em vez de deixar a fase "sumir" sem gerar a empresa.
export async function concluirFase(
  faseId: string,
  processoId: string,
  dataConclusao: string,
): Promise<ConcluirFaseResult> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: fase }, { data: processo }] = await Promise.all([
    supabase.from("legalizacao_processo_fases").select("nome, acao, data_conclusao").eq("id", faseId).single(),
    supabase.from("legalizacao_processos").select("company_id").eq("id", processoId).single(),
  ]);
  if (!fase || !processo) return { error: "Processo ou fase não encontrados." };
  if (fase.data_conclusao) return undefined;

  if (fase.acao === "CRIAR_EMPRESA" && !processo.company_id) {
    return { redirectTo: `/legalizacao/processos/${processoId}/cadastrar-empresa` };
  }

  const { error } = await supabase
    .from("legalizacao_processo_fases")
    .update({
      data_conclusao: dataConclusao,
      concluido_em: new Date().toISOString(),
      concluido_por: user.id,
      status_manual: null,
    })
    .eq("id", faseId);
  if (error) return { error: "Não foi possível concluir a fase." };

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_id: faseId,
    fase_nome: fase.nome,
    campo: "STATUS_FASE",
    de_valor: null,
    para_valor: "CONCLUIDO",
    user_id: user.id,
  });
  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: processoId,
    fase_id: faseId,
    tipo: "STATUS_FASE",
    autor_id: user.id,
    corpo: `Concluiu "${fase.nome}".`,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/processos");
  return undefined;
}

export async function reabrirFase(faseId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: fase } = await supabase
    .from("legalizacao_processo_fases")
    .select("nome")
    .eq("id", faseId)
    .single();
  if (!fase) throw new Error("Fase não encontrada.");

  const { error } = await supabase
    .from("legalizacao_processo_fases")
    .update({ data_conclusao: null, concluido_em: null, concluido_por: null })
    .eq("id", faseId);
  if (error) throw new Error("Não foi possível reabrir a fase.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_id: faseId,
    fase_nome: fase.nome,
    campo: "STATUS_FASE",
    de_valor: "CONCLUIDO",
    para_valor: null,
    user_id: user.id,
  });
  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: processoId,
    fase_id: faseId,
    tipo: "STATUS_FASE",
    autor_id: user.id,
    corpo: `Reabriu "${fase.nome}".`,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/processos");
}

// ---------------------------------------------------------------------------
// Adicionar/remover fase específica desta instância (não mexe no template).
// ---------------------------------------------------------------------------
export async function adicionarFaseProcesso(processoId: string, nome: string) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const nomeLimpo = nome.trim();
  if (nomeLimpo.length < 2) throw new Error("Informe o nome da fase.");

  const supabase = await createClient();
  const { data: ultima } = await supabase
    .from("legalizacao_processo_fases")
    .select("ordem")
    .eq("processo_id", processoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = (ultima?.ordem ?? 0) + 10;

  const { error } = await supabase
    .from("legalizacao_processo_fases")
    .insert({ processo_id: processoId, nome: nomeLimpo, ordem });
  if (error) throw new Error("Não foi possível adicionar a fase.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_nome: nomeLimpo,
    campo: "FASE_ADICIONADA",
    para_valor: nomeLimpo,
    user_id: user.id,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function removerFaseProcesso(faseId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: fase } = await supabase
    .from("legalizacao_processo_fases")
    .select("nome")
    .eq("id", faseId)
    .single();
  if (!fase) throw new Error("Fase não encontrada.");

  const { error } = await supabase.from("legalizacao_processo_fases").delete().eq("id", faseId);
  if (error) throw new Error("Não foi possível remover a fase.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    fase_nome: fase.nome,
    campo: "FASE_REMOVIDA",
    de_valor: fase.nome,
    user_id: user.id,
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
}

// ---------------------------------------------------------------------------
// Comentários
// ---------------------------------------------------------------------------
const comentarioSchema = z.object({
  processoId: uuidLike,
  corpo: z.string().trim().min(1, "Escreva um comentário."),
});

export async function adicionarComentarioProcesso(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  const parsed = comentarioSchema.safeParse({
    processoId: formData.get("processoId"),
    corpo: formData.get("corpo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: parsed.data.processoId,
    tipo: "COMENTARIO",
    autor_id: user.id,
    corpo: parsed.data.corpo,
  });
  if (error) return { error: "Não foi possível salvar o comentário." };

  revalidatePath(`/legalizacao/processos/${parsed.data.processoId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Anexos — mesmo padrão de duas peças do Blob, com proxy de download (nunca
// link direto pro Blob, que é privado).
// ---------------------------------------------------------------------------
const salvarAnexoSchema = z.object({
  processoId: uuidLike,
  faseId: uuidLike.optional().or(z.literal("")),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  nomeArquivo: z.string().min(1),
});

export async function salvarAnexoProcesso(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  const parsed = salvarAnexoSchema.safeParse({
    processoId: formData.get("processoId"),
    faseId: formData.get("faseId") || undefined,
    blobUrl: formData.get("blobUrl"),
    blobPathname: formData.get("blobPathname"),
    nomeArquivo: formData.get("nomeArquivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("legalizacao_processo_anexos").insert({
    processo_id: parsed.data.processoId,
    fase_id: parsed.data.faseId || null,
    blob_url: parsed.data.blobUrl,
    blob_pathname: parsed.data.blobPathname,
    nome_arquivo: parsed.data.nomeArquivo,
    uploaded_by: user.id,
  });
  if (error) return { error: "Não foi possível salvar o anexo." };

  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: parsed.data.processoId,
    fase_id: parsed.data.faseId || null,
    tipo: "ANEXO",
    autor_id: user.id,
    corpo: `Anexou "${parsed.data.nomeArquivo}".`,
  });

  revalidatePath(`/legalizacao/processos/${parsed.data.processoId}`);
  return { success: true };
}

export async function apagarAnexoProcesso(anexoId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();

  const { data: anexo } = await supabase
    .from("legalizacao_processo_anexos")
    .select("blob_pathname")
    .eq("id", anexoId)
    .single();
  if (!anexo) return;

  const { error } = await supabase.from("legalizacao_processo_anexos").delete().eq("id", anexoId);
  if (error) throw new Error("Não foi possível remover o anexo.");

  await del(anexo.blob_pathname).catch(() => {});
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function apagarBlobOrfaoProcesso(pathname: string) {
  await requirePermissao("legalizacao.editar");
  if (!pathname.startsWith("legalizacao-processos/")) return;
  await del(pathname).catch(() => {});
}

// ---------------------------------------------------------------------------
// Arquivar / excluir — mesmo padrão do Comercial.
// ---------------------------------------------------------------------------
export async function arquivarProcesso(processoId: string) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("legalizacao_processos")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", processoId);
  if (error) throw new Error("Não foi possível arquivar o processo.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    campo: "ARQUIVAMENTO",
    para_valor: "ARQUIVADO",
    user_id: user.id,
  });

  revalidatePath("/legalizacao/processos");
  revalidatePath("/legalizacao/processos/arquivados");
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function desarquivarProcesso(processoId: string) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("legalizacao_processos")
    .update({ arquivado_em: null })
    .eq("id", processoId);
  if (error) throw new Error("Não foi possível desarquivar o processo.");

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    campo: "ARQUIVAMENTO",
    para_valor: "DESARQUIVADO",
    user_id: user.id,
  });

  revalidatePath("/legalizacao/processos");
  revalidatePath("/legalizacao/processos/arquivados");
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function excluirProcessoPermanente(processoId: string) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  const { error } = await supabase.from("legalizacao_processos").delete().eq("id", processoId);
  if (error) throw new Error("Não foi possível excluir o processo.");
  revalidatePath("/legalizacao/processos");
  revalidatePath("/legalizacao/processos/arquivados");
  redirect("/legalizacao/processos");
}

// ---------------------------------------------------------------------------
// Abertura virando empresa de verdade.
// ---------------------------------------------------------------------------
const cadastrarEmpresaSchema = z.object({
  processoId: uuidLike,
  organizationName: z.string().trim().min(2, "Informe o nome da empresa/organização."),
  legalName: z.string().trim().min(2, "Informe a razão social."),
  tradeName: z.string().trim().optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  cnae: z.string().trim().optional(),
  municipalityIbgeCode: z.string().trim().optional(),
  municipalityName: z.string().trim().optional(),
  state: z.string().trim().optional(),
  addressStreet: z.string().trim().optional(),
  addressNumber: z.string().trim().optional(),
  addressComplement: z.string().trim().optional(),
  addressNeighborhood: z.string().trim().optional(),
  addressZip: z.string().trim().optional(),
  taxRegime: z
    .enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "IMUNE_ISENTO"])
    .optional()
    .or(z.literal("")),
  dataAbertura: z.string().trim().optional(),
  vincularExistenteId: uuidLike.optional().or(z.literal("")),
});

// Chamada tanto pela tela "empresa já existe com esse CNPJ" (vincula) quanto
// pelo formulário completo (cria). Checa isSomaStaff() além de
// legalizacao.editar porque a RLS de companies/organizations exige
// empresas.ver — sem essa checagem explícita, um analista só-legalização
// bateria numa falha de RLS crua em vez de uma mensagem amigável.
export async function cadastrarEmpresaDoProcesso(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  if (!(await isSomaStaff())) {
    return { error: "Você não tem permissão para cadastrar empresas — peça a um administrador." };
  }

  const parsed = cadastrarEmpresaSchema.safeParse({
    processoId: formData.get("processoId"),
    organizationName: formData.get("organizationName"),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    cnae: formData.get("cnae") || undefined,
    municipalityIbgeCode: formData.get("municipalityIbgeCode") || undefined,
    municipalityName: formData.get("municipalityName") || undefined,
    state: formData.get("state") || undefined,
    addressStreet: formData.get("addressStreet") || undefined,
    addressNumber: formData.get("addressNumber") || undefined,
    addressComplement: formData.get("addressComplement") || undefined,
    addressNeighborhood: formData.get("addressNeighborhood") || undefined,
    addressZip: formData.get("addressZip") || undefined,
    taxRegime: formData.get("taxRegime") || undefined,
    dataAbertura: formData.get("dataAbertura") || undefined,
    vincularExistenteId: formData.get("vincularExistenteId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { processoId, vincularExistenteId, ...dadosEmpresa } = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: processo } = await supabase
    .from("legalizacao_processos")
    .select("id, company_id")
    .eq("id", processoId)
    .single();
  if (!processo) return { error: "Processo não encontrado." };

  let companyId = processo.company_id;
  if (!companyId) {
    if (vincularExistenteId) {
      companyId = vincularExistenteId;
    } else {
      const resultado = await criarEmpresaComOrganizacao({ ...dadosEmpresa, personType: "PJ" });
      if ("error" in resultado) return { error: resultado.error };
      companyId = resultado.companyId;
    }
  }

  const { error } = await supabase
    .from("legalizacao_processos")
    .update({ company_id: companyId })
    .eq("id", processoId);
  if (error) return { error: "Não foi possível vincular a empresa ao processo." };

  await supabase.from("legalizacao_processo_historico").insert({
    processo_id: processoId,
    campo: "EMPRESA_VINCULADA",
    para_valor: companyId,
    user_id: user.id,
  });
  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: processoId,
    tipo: "SISTEMA",
    autor_id: user.id,
    corpo: vincularExistenteId
      ? "Vinculou uma empresa já existente."
      : `Empresa criada automaticamente: ${dadosEmpresa.legalName}.`,
  });

  // Conclui a fase CRIAR_EMPRESA agora que já existe company_id.
  const { data: faseCriarEmpresa } = await supabase
    .from("legalizacao_processo_fases")
    .select("id, nome")
    .eq("processo_id", processoId)
    .eq("acao", "CRIAR_EMPRESA")
    .is("data_conclusao", null)
    .maybeSingle();
  if (faseCriarEmpresa) {
    const hoje = new Date().toISOString().slice(0, 10);
    await supabase
      .from("legalizacao_processo_fases")
      .update({ data_conclusao: hoje, concluido_em: new Date().toISOString(), concluido_por: user.id })
      .eq("id", faseCriarEmpresa.id);
    await supabase.from("legalizacao_processo_historico").insert({
      processo_id: processoId,
      fase_id: faseCriarEmpresa.id,
      fase_nome: faseCriarEmpresa.nome,
      campo: "STATUS_FASE",
      para_valor: "CONCLUIDO",
      user_id: user.id,
    });
  }

  await logAudit({
    companyId,
    action: "CREATE",
    entity: "legalizacao_processo_empresa",
    entityId: processoId,
    newValue: { processo_id: processoId, legal_name: dadosEmpresa.legalName },
  });

  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/processos");
  redirect(`/legalizacao/processos/${processoId}`);
}

// Ao concluir 100% de um Encerramento, a UI oferece este atalho — nunca
// automático, porque inativar impacta emissão de nota e outras coisas.
export async function inativarEmpresaDoProcesso(companyId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  if (!(await isSomaStaff())) {
    throw new Error("Você não tem permissão para inativar empresas — peça a um administrador.");
  }

  const formData = new FormData();
  formData.set("companyId", companyId);
  formData.set("dataEncerramentoSoma", new Date().toISOString().slice(0, 10));
  const resultado = await inativarEmpresa(undefined, formData);
  if (resultado?.error) throw new Error(resultado.error);

  revalidatePath(`/legalizacao/processos/${processoId}`);
}

// ---------------------------------------------------------------------------
// Admin de fluxos e fases-template — gated por legalizacao.editar (mesmo
// precedente de "Tipos de documento" no próprio módulo, não Super Admin).
// ---------------------------------------------------------------------------
const fluxoSchema = z.object({
  fluxoId: uuidLike.optional(),
  chave: z.string().trim().min(2, "Informe a chave.").regex(/^[A-Z0-9_]+$/, "Use maiúsculas, números e _."),
  nome: z.string().trim().min(2, "Informe o nome."),
  tipoProcesso: z.enum(["ABERTURA", "ALTERACAO", "ENCERRAMENTO"]),
  prazoPadraoDias: z.coerce.number().int().positive().optional().or(z.literal("")),
  ordem: z.coerce.number().int(),
});

export async function salvarFluxo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  const parsed = fluxoSchema.safeParse({
    fluxoId: formData.get("fluxoId") || undefined,
    chave: formData.get("chave"),
    nome: formData.get("nome"),
    tipoProcesso: formData.get("tipoProcesso"),
    prazoPadraoDias: formData.get("prazoPadraoDias") || undefined,
    ordem: formData.get("ordem"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { fluxoId, prazoPadraoDias, ...rest } = parsed.data;
  const payload = {
    chave: rest.chave,
    nome: rest.nome,
    tipo_processo: rest.tipoProcesso,
    prazo_padrao_dias: prazoPadraoDias || null,
    ordem: rest.ordem,
  };

  const supabase = await createClient();
  const { error } = fluxoId
    ? await supabase.from("legalizacao_fluxos").update(payload).eq("id", fluxoId)
    : await supabase.from("legalizacao_fluxos").insert(payload);
  if (error) {
    return {
      error: error.code === "23505" ? "Já existe um fluxo com essa chave ou nome." : "Não foi possível salvar o fluxo.",
    };
  }

  revalidatePath("/legalizacao/fluxos");
  return { success: true };
}

export async function alternarAtivoFluxo(fluxoId: string, ativo: boolean) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  const { error } = await supabase.from("legalizacao_fluxos").update({ ativo }).eq("id", fluxoId);
  if (error) throw new Error("Não foi possível atualizar o fluxo.");
  revalidatePath("/legalizacao/fluxos");
}

const faseTemplateSchema = z.object({
  faseId: uuidLike.optional(),
  fluxoId: uuidLike,
  nome: z.string().trim().min(2, "Informe o nome."),
  ordem: z.coerce.number().int(),
  descricao: z.string().trim().optional(),
  acao: z.enum(["CRIAR_EMPRESA"]).optional().or(z.literal("")),
  tipoDocumentoId: uuidLike.optional().or(z.literal("")),
});

export async function salvarFaseTemplate(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  const parsed = faseTemplateSchema.safeParse({
    faseId: formData.get("faseId") || undefined,
    fluxoId: formData.get("fluxoId"),
    nome: formData.get("nome"),
    ordem: formData.get("ordem"),
    descricao: formData.get("descricao") || undefined,
    acao: formData.get("acao") || undefined,
    tipoDocumentoId: formData.get("tipoDocumentoId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { faseId, fluxoId, tipoDocumentoId, acao, ...rest } = parsed.data;
  const payload = {
    fluxo_id: fluxoId,
    nome: rest.nome,
    ordem: rest.ordem,
    descricao: rest.descricao || null,
    acao: acao || null,
    tipo_documento_id: tipoDocumentoId || null,
  };

  const supabase = await createClient();
  const { error } = faseId
    ? await supabase.from("legalizacao_fluxo_fases_template").update(payload).eq("id", faseId)
    : await supabase.from("legalizacao_fluxo_fases_template").insert(payload);
  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("uma_criar_empresa")
          ? "Esse fluxo já tem uma fase marcada como \"Criar empresa\"."
          : "Já existe uma fase com esse nome nesse fluxo.",
      };
    }
    return { error: "Não foi possível salvar a fase." };
  }

  revalidatePath(`/legalizacao/fluxos/${fluxoId}`);
  return { success: true };
}

export async function alternarAtivoFaseTemplate(faseId: string, fluxoId: string, ativo: boolean) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  const { error } = await supabase.from("legalizacao_fluxo_fases_template").update({ ativo }).eq("id", faseId);
  if (error) throw new Error("Não foi possível atualizar a fase.");
  revalidatePath(`/legalizacao/fluxos/${fluxoId}`);
}

// Usado pela tela de dashboard pra popular o filtro/seletor de responsável,
// contornando a RLS de profiles pra quem só tem legalizacao.editar (ver
// legalizacao_responsaveis() na migration).
export async function listarResponsaveisLegalizacao(): Promise<{ id: string; full_name: string }[]> {
  await requirePermissao("legalizacao.ver");
  const supabase = await createClient();
  const { data } = await supabase.rpc("legalizacao_responsaveis");
  return data ?? [];
}

export async function podeEditarLegalizacao(): Promise<boolean> {
  return temPermissao("legalizacao.editar");
}
