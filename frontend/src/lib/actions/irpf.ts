"use server";

import { revalidatePath } from "next/cache";
import { del, get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { lerDec, decodificarArquivo, DecInvalidoError, type ResumoDeclaracao } from "@/lib/irpf/dec-parser";
import {
  CHECKLIST_STATUS,
  HONORARIO_STATUS,
  STATUS_DECLARACAO,
  camposCadastro,
  resumoParaGravar,
  sugerirChecklist,
  type ChecklistStatus,
  type HonorarioStatus,
  type ResumoGravado,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";

type Erro = { error: string };

function revalidar(declaracaoId?: string) {
  revalidatePath("/irpf", "layout");
  if (declaracaoId) revalidatePath(`/irpf/declaracoes/${declaracaoId}`);
}

async function lerBlobTexto(pathname: string): Promise<{ texto: string; tamanho: number }> {
  const blob = await get(pathname, { access: "private" });
  if (!blob || blob.statusCode !== 200) throw new Error("Arquivo não encontrado no Blob.");
  const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
  return { texto: decodificarArquivo(bytes), tamanho: bytes.byteLength };
}

function pathnameValido(p: string | null | undefined): p is string {
  return !!p && p.startsWith("irpf/") && !p.includes("..");
}

// ------------------------------------------------------------- importação

/** Data/hora de transmissão como texto ordenável ("" = não transmitida). */
function chaveTransmissao(r: Pick<ResumoGravado, "transmissao"> | null): string {
  return r?.transmissao ? `${r.transmissao.data}T${r.transmissao.hora}` : "";
}

/**
 * A versão nova substitui a gravada? Regra: transmitida ganha de não
 * transmitida; entre transmitidas, a mais recente; entre não transmitidas,
 * a que chegou por último (é o trabalho em andamento).
 */
function substitui(atual: ResumoGravado | null, nova: ResumoDeclaracao): boolean {
  if (!atual) return true;
  const a = chaveTransmissao(atual);
  const n = chaveTransmissao(nova);
  if (a && !n) return nova.retificadora; // retificadora em preparação
  if (!a && n) return true;
  if (a && n) return n >= a;
  return true;
}

export type ResultadoImportacao =
  | {
      ok: true;
      declaracaoId: string;
      contribuinteNovo: boolean;
      acao: "CRIADA" | "ATUALIZADA" | "MANTIDA" | "REPETIDA";
    }
  | Erro;

/**
 * Registra um .DEC (e o .REC, se veio junto) já enviado ao Blob privado:
 * lê o arquivo, cria ou completa o contribuinte pelo CPF e cria ou atualiza
 * a declaração do exercício. Reimportar o mesmo arquivo não duplica nada.
 */
export async function importarDeclaracaoAction(input: {
  decPathname: string;
  decNome: string;
  recPathname?: string | null;
  recNome?: string | null;
}): Promise<ResultadoImportacao> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!pathnameValido(input.decPathname)) return { error: "Arquivo inválido." };
  if (input.recPathname && !pathnameValido(input.recPathname)) return { error: "Recibo inválido." };

  let resumo: ResumoDeclaracao;
  let tamDec = 0;
  let tamRec: number | null = null;
  try {
    const dec = await lerBlobTexto(input.decPathname);
    tamDec = dec.tamanho;
    const rec = input.recPathname ? await lerBlobTexto(input.recPathname) : null;
    tamRec = rec?.tamanho ?? null;
    resumo = lerDec(dec.texto, rec?.texto ?? null);
  } catch (e) {
    await del([input.decPathname, ...(input.recPathname ? [input.recPathname] : [])]).catch(() => {});
    if (e instanceof DecInvalidoError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Falha ao ler o arquivo." };
  }

  const supabase = await createClient();

  // Contribuinte pelo CPF (cria ou completa e-mail/telefone/nascimento).
  const { data: existente, error: e1 } = await supabase
    .from("irpf_contribuintes")
    .select("id, email, telefone, nascimento, cadastro_exercicio")
    .eq("cpf", resumo.cpf)
    .maybeSingle();
  if (e1) return { error: e1.message };
  let contribuinteId: string;
  let contribuinteNovo = false;
  if (existente) {
    contribuinteId = existente.id;
    const completar: Record<string, unknown> = {};
    // Cadastro (endereço, banco, ocupação…) acompanha a declaração mais recente.
    if (!existente.cadastro_exercicio || resumo.exercicio >= existente.cadastro_exercicio) {
      Object.assign(completar, camposCadastro(resumo));
    }
    if (!existente.email && resumo.email) completar.email = resumo.email;
    if (!existente.telefone && resumo.telefone) completar.telefone = resumo.telefone;
    if (!existente.nascimento && resumo.nascimento) completar.nascimento = resumo.nascimento;
    if (Object.keys(completar).length) {
      await supabase.from("irpf_contribuintes").update(completar).eq("id", contribuinteId);
    }
  } else {
    const { data: novo, error } = await supabase
      .from("irpf_contribuintes")
      .insert({
        nome: resumo.nome,
        cpf: resumo.cpf,
        nascimento: resumo.nascimento,
        email: resumo.email,
        telefone: resumo.telefone,
        ...camposCadastro(resumo),
      })
      .select("id")
      .single();
    if (error || !novo) return { error: error?.message ?? "Falha ao criar o contribuinte." };
    contribuinteId = novo.id;
    contribuinteNovo = true;
  }

  // Declaração do exercício.
  const { data: decl, error: e2 } = await supabase
    .from("irpf_declaracoes")
    .select("id, status, resumo")
    .eq("contribuinte_id", contribuinteId)
    .eq("exercicio", resumo.exercicio)
    .maybeSingle();
  if (e2) return { error: e2.message };

  let declaracaoId = decl?.id as string | undefined;

  // Mesmo arquivo já importado? (nome + tamanho) — não duplica.
  if (declaracaoId) {
    const { data: repetido } = await supabase
      .from("irpf_arquivos")
      .select("id")
      .eq("declaracao_id", declaracaoId)
      .eq("tipo", "DEC")
      .eq("nome_arquivo", input.decNome)
      .eq("tamanho", tamDec)
      .limit(1);
    if (repetido?.length) {
      await del([input.decPathname, ...(input.recPathname ? [input.recPathname] : [])]).catch(() => {});
      return { ok: true, declaracaoId, contribuinteNovo, acao: "REPETIDA" };
    }
  }

  const transmitida = !!(resumo.numeroRecibo && resumo.transmissao);
  const camposResumo = {
    completa: resumo.completa,
    retificadora: resumo.retificadora,
    resultado: resumo.resultado,
    imposto_pagar: resumo.totais.impostoPagar,
    imposto_restituir: resumo.totais.impostoRestituir,
    quotas: resumo.totais.quotas || null,
    numero_recibo: resumo.numeroRecibo,
    transmitida_em: resumo.transmissao ? `${resumo.transmissao.data}T${resumo.transmissao.hora}-03:00` : null,
    resumo: resumoParaGravar(resumo),
    resumo_atualizado_em: new Date().toISOString(),
  };

  let acao: "CRIADA" | "ATUALIZADA" | "MANTIDA";
  if (!declaracaoId) {
    const { data: nova, error } = await supabase
      .from("irpf_declaracoes")
      .insert({
        contribuinte_id: contribuinteId,
        exercicio: resumo.exercicio,
        status: transmitida ? "TRANSMITIDA" : "EM_ELABORACAO",
        ...camposResumo,
      })
      .select("id")
      .single();
    if (error || !nova) return { error: error?.message ?? "Falha ao criar a declaração." };
    declaracaoId = nova.id as string;
    acao = "CRIADA";
  } else if (substitui(decl!.resumo as ResumoGravado | null, resumo)) {
    const statusAtual = decl!.status as StatusDeclaracao;
    let status = statusAtual;
    if (transmitida) status = "TRANSMITIDA";
    else if (["NAO_INICIADA", "AGUARDANDO_DOCUMENTOS", "DOCUMENTOS_RECEBIDOS"].includes(statusAtual)) status = "EM_ELABORACAO";
    const { error } = await supabase
      .from("irpf_declaracoes")
      .update({ ...camposResumo, status })
      .eq("id", declaracaoId);
    if (error) return { error: error.message };
    if (status !== statusAtual) {
      await supabase.from("irpf_eventos").insert({
        declaracao_id: declaracaoId,
        user_id: user.id,
        tipo: "STATUS",
        de: statusAtual,
        para: status,
      });
    }
    acao = "ATUALIZADA";
  } else {
    acao = "MANTIDA";
  }

  const arquivos = [
    {
      declaracao_id: declaracaoId,
      tipo: "DEC",
      blob_pathname: input.decPathname,
      nome_arquivo: input.decNome,
      tamanho: tamDec,
      retificadora: resumo.retificadora,
      uploaded_by: user.id,
    },
    ...(input.recPathname
      ? [
          {
            declaracao_id: declaracaoId,
            tipo: "REC",
            blob_pathname: input.recPathname,
            nome_arquivo: input.recNome || "recibo.REC",
            tamanho: tamRec,
            retificadora: resumo.retificadora,
            uploaded_by: user.id,
          },
        ]
      : []),
  ];
  const { error: e3 } = await supabase.from("irpf_arquivos").insert(arquivos);
  if (e3) return { error: e3.message };

  await supabase.from("irpf_eventos").insert({
    declaracao_id: declaracaoId,
    user_id: user.id,
    tipo: "IMPORTACAO",
    comentario: `${resumo.retificadora ? "Retificadora" : "Original"} ${transmitida ? "transmitida" : "gravada"} — ${
      acao === "MANTIDA" ? "arquivo guardado; o resumo continua o da versão mais recente" : "resumo atualizado"
    }`,
  });

  revalidar(declaracaoId);
  return { ok: true, declaracaoId, contribuinteNovo, acao };
}

// ------------------------------------------------------------- declaração

export async function atualizarDeclaracaoAction(input: {
  id: string;
  status?: StatusDeclaracao;
  responsavelId?: string | null;
  revisorId?: string | null;
  honorarioValor?: number | null;
  honorarioStatus?: HonorarioStatus;
  observacoes?: string | null;
  comentario?: string | null;
}): Promise<{ ok: true } | Erro> {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data: antes, error: e1 } = await supabase
    .from("irpf_declaracoes")
    .select("status, responsavel_id, revisor_id, honorario_valor, honorario_status")
    .eq("id", input.id)
    .maybeSingle();
  if (e1) return { error: e1.message };
  if (!antes) return { error: "Declaração não encontrada." };

  const upd: Record<string, unknown> = {};
  const eventos: { tipo: string; de: string | null; para: string | null; comentario?: string | null }[] = [];

  if (input.status !== undefined && input.status !== antes.status) {
    if (!STATUS_DECLARACAO.includes(input.status)) return { error: "Status inválido." };
    upd.status = input.status;
    if (input.status === "AGUARDANDO_APROVACAO") upd.aprovacao_enviada_em = new Date().toISOString();
    if (input.status === "APROVADA") upd.aprovada_em = new Date().toISOString();
    eventos.push({ tipo: "STATUS", de: antes.status, para: input.status, comentario: input.comentario?.trim() || null });
  }
  if (input.responsavelId !== undefined && input.responsavelId !== antes.responsavel_id) {
    upd.responsavel_id = input.responsavelId;
    eventos.push({ tipo: "RESPONSAVEL", de: antes.responsavel_id, para: input.responsavelId });
  }
  if (input.revisorId !== undefined && input.revisorId !== antes.revisor_id) {
    upd.revisor_id = input.revisorId;
    eventos.push({ tipo: "REVISOR", de: antes.revisor_id, para: input.revisorId });
  }
  if (input.honorarioValor !== undefined) {
    if (input.honorarioValor !== null && (!Number.isFinite(input.honorarioValor) || input.honorarioValor < 0)) {
      return { error: "Valor de honorário inválido." };
    }
    if (input.honorarioValor !== (antes.honorario_valor === null ? null : Number(antes.honorario_valor))) {
      upd.honorario_valor = input.honorarioValor;
      eventos.push({
        tipo: "HONORARIO",
        de: antes.honorario_valor === null ? null : String(antes.honorario_valor),
        para: input.honorarioValor === null ? null : String(input.honorarioValor),
      });
    }
  }
  if (input.honorarioStatus !== undefined && input.honorarioStatus !== antes.honorario_status) {
    if (!HONORARIO_STATUS.includes(input.honorarioStatus)) return { error: "Situação do honorário inválida." };
    upd.honorario_status = input.honorarioStatus;
    eventos.push({ tipo: "HONORARIO", de: antes.honorario_status, para: input.honorarioStatus });
  }
  if (input.observacoes !== undefined) upd.observacoes = input.observacoes?.trim() || null;

  if (Object.keys(upd).length) {
    const { error } = await supabase.from("irpf_declaracoes").update(upd).eq("id", input.id);
    if (error) return { error: error.message };
  }
  if (!eventos.length && input.comentario?.trim()) {
    eventos.push({ tipo: "COMENTARIO", de: null, para: null, comentario: input.comentario.trim() });
  }
  if (eventos.length) {
    await supabase
      .from("irpf_eventos")
      .insert(eventos.map((e) => ({ ...e, declaracao_id: input.id, user_id: user.id })));
  }
  revalidar(input.id);
  return { ok: true };
}

// ------------------------------------------------------------- checklist

export async function adicionarItemChecklistAction(input: {
  declaracaoId: string;
  categoria: string;
  descricao: string;
}): Promise<{ ok: true } | Erro> {
  await requireSomaStaff();
  const descricao = input.descricao.trim();
  if (!descricao) return { error: "Descreva o documento." };
  const supabase = await createClient();
  const { count } = await supabase
    .from("irpf_checklist_itens")
    .select("id", { count: "exact", head: true })
    .eq("declaracao_id", input.declaracaoId);
  const { error } = await supabase.from("irpf_checklist_itens").insert({
    declaracao_id: input.declaracaoId,
    categoria: input.categoria.trim() || "Outros",
    descricao,
    origem: "MANUAL",
    ordem: (count ?? 0) + 1,
  });
  if (error) return { error: error.message };
  revalidar(input.declaracaoId);
  return { ok: true };
}

export async function mudarItemChecklistAction(input: {
  declaracaoId: string;
  itemId: string;
  status?: ChecklistStatus;
  remover?: boolean;
}): Promise<{ ok: true } | Erro> {
  await requireSomaStaff();
  const supabase = await createClient();
  if (input.remover) {
    const { error } = await supabase
      .from("irpf_checklist_itens")
      .delete()
      .eq("id", input.itemId)
      .eq("declaracao_id", input.declaracaoId);
    if (error) return { error: error.message };
  } else {
    if (!input.status || !CHECKLIST_STATUS.includes(input.status)) return { error: "Situação inválida." };
    const { error } = await supabase
      .from("irpf_checklist_itens")
      .update({ status: input.status })
      .eq("id", input.itemId)
      .eq("declaracao_id", input.declaracaoId);
    if (error) return { error: error.message };
  }
  revalidar(input.declaracaoId);
  return { ok: true };
}

/** Recria os itens sugeridos (padrão + ano anterior) que ainda não existem. */
export async function sugerirChecklistAction(declaracaoId: string): Promise<{ ok: true; criados: number } | Erro> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: d } = await supabase
    .from("irpf_declaracoes")
    .select("contribuinte_id, exercicio")
    .eq("id", declaracaoId)
    .maybeSingle();
  if (!d) return { error: "Declaração não encontrada." };
  const { data: anterior } = await supabase
    .from("irpf_declaracoes")
    .select("resumo")
    .eq("contribuinte_id", d.contribuinte_id)
    .lt("exercicio", d.exercicio)
    .not("resumo", "is", null)
    .order("exercicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: atuais } = await supabase
    .from("irpf_checklist_itens")
    .select("descricao")
    .eq("declaracao_id", declaracaoId);
  const ja = new Set((atuais ?? []).map((i) => i.descricao.toLowerCase()));
  const novos = sugerirChecklist((anterior?.resumo as ResumoGravado | null) ?? null)
    .filter((i) => !ja.has(i.descricao.toLowerCase()))
    .map((i, n) => ({ ...i, declaracao_id: declaracaoId, ordem: (atuais?.length ?? 0) + n + 1 }));
  if (novos.length) {
    const { error } = await supabase.from("irpf_checklist_itens").insert(novos);
    if (error) return { error: error.message };
  }
  revalidar(declaracaoId);
  return { ok: true, criados: novos.length };
}

// ------------------------------------------------------------- documentos

export async function registrarDocumentoAction(input: {
  declaracaoId: string;
  pathname: string;
  nome: string;
  tamanho: number;
  descricao?: string | null;
}): Promise<{ ok: true } | Erro> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!pathnameValido(input.pathname)) return { error: "Arquivo inválido." };
  const supabase = await createClient();
  const { error } = await supabase.from("irpf_arquivos").insert({
    declaracao_id: input.declaracaoId,
    tipo: "DOCUMENTO",
    blob_pathname: input.pathname,
    nome_arquivo: input.nome,
    tamanho: input.tamanho,
    descricao: input.descricao?.trim() || null,
    uploaded_by: user.id,
  });
  if (error) return { error: error.message };
  revalidar(input.declaracaoId);
  return { ok: true };
}

export async function excluirArquivoAction(input: { declaracaoId: string; arquivoId: string }): Promise<{ ok: true } | Erro> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: arq } = await supabase
    .from("irpf_arquivos")
    .select("blob_pathname, tipo")
    .eq("id", input.arquivoId)
    .eq("declaracao_id", input.declaracaoId)
    .maybeSingle();
  if (!arq) return { error: "Arquivo não encontrado." };
  if (arq.tipo !== "DOCUMENTO") return { error: "Os arquivos da declaração (.DEC/.REC) não são excluídos." };
  const { error } = await supabase.from("irpf_arquivos").delete().eq("id", input.arquivoId);
  if (error) return { error: error.message };
  await del(arq.blob_pathname).catch(() => {});
  revalidar(input.declaracaoId);
  return { ok: true };
}

// ------------------------------------------------------------- exercício

/**
 * Abre o exercício: cria a declaração (Não iniciada) de cada contribuinte
 * ativo que ainda não tem, com o responsável do ano anterior e o checklist
 * sugerido a partir da última declaração dele.
 */
export async function abrirExercicioAction(exercicio: number): Promise<{ ok: true; criadas: number } | Erro> {
  await requireSomaStaff();
  if (!Number.isInteger(exercicio) || exercicio < 2020 || exercicio > 2100) return { error: "Exercício inválido." };
  const supabase = await createClient();

  const contribuintes = await buscarTudoPaginado<{ id: string; responsavel_id: string | null }>((from, to) =>
    supabase.from("irpf_contribuintes").select("id, responsavel_id").eq("ativo", true).order("id").range(from, to),
  );
  const declaracoes = await buscarTudoPaginado<{
    id: string;
    contribuinte_id: string;
    exercicio: number;
    responsavel_id: string | null;
    resumo: ResumoGravado | null;
  }>((from, to) =>
    supabase
      .from("irpf_declaracoes")
      .select("id, contribuinte_id, exercicio, responsavel_id, resumo")
      .lte("exercicio", exercicio)
      .order("id")
      .range(from, to),
  );

  const jaTem = new Set(declaracoes.filter((d) => d.exercicio === exercicio).map((d) => d.contribuinte_id));
  const ultimaPorContribuinte = new Map<string, (typeof declaracoes)[number]>();
  for (const d of declaracoes) {
    if (d.exercicio >= exercicio) continue;
    const u = ultimaPorContribuinte.get(d.contribuinte_id);
    if (!u || d.exercicio > u.exercicio) ultimaPorContribuinte.set(d.contribuinte_id, d);
  }

  const faltam = contribuintes.filter((c) => !jaTem.has(c.id));
  let criadas = 0;
  for (let i = 0; i < faltam.length; i += 200) {
    const lote = faltam.slice(i, i + 200);
    const { data: novas, error } = await supabase
      .from("irpf_declaracoes")
      .insert(
        lote.map((c) => ({
          contribuinte_id: c.id,
          exercicio,
          status: "NAO_INICIADA",
          responsavel_id: c.responsavel_id ?? ultimaPorContribuinte.get(c.id)?.responsavel_id ?? null,
        })),
      )
      .select("id, contribuinte_id");
    if (error) return { error: error.message };
    const itens = (novas ?? []).flatMap((n) =>
      sugerirChecklist(ultimaPorContribuinte.get(n.contribuinte_id)?.resumo ?? null).map((it, ordem) => ({
        ...it,
        declaracao_id: n.id,
        ordem: ordem + 1,
      })),
    );
    for (let j = 0; j < itens.length; j += 1000) {
      const { error: eItens } = await supabase.from("irpf_checklist_itens").insert(itens.slice(j, j + 1000));
      if (eItens) return { error: eItens.message };
    }
    criadas += novas?.length ?? 0;
  }
  revalidar();
  return { ok: true, criadas };
}

// ------------------------------------------------------------- contribuintes

function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

export async function salvarContribuinteAction(input: {
  id?: string;
  nome: string;
  cpf?: string;
  email?: string | null;
  telefone?: string | null;
  responsavelId?: string | null;
  observacoes?: string | null;
  ativo?: boolean;
}): Promise<{ ok: true; id: string } | Erro> {
  await requireSomaStaff();
  const nome = input.nome.trim();
  if (!nome) return { error: "Informe o nome." };
  const dados = {
    nome,
    email: input.email?.trim().toLowerCase() || null,
    telefone: soDigitos(input.telefone) || null,
    responsavel_id: input.responsavelId ?? null,
    observacoes: input.observacoes?.trim() || null,
    ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
  };
  const supabase = await createClient();
  if (input.id) {
    const { error } = await supabase.from("irpf_contribuintes").update(dados).eq("id", input.id);
    if (error) return { error: error.message };
    revalidar();
    return { ok: true, id: input.id };
  }
  const cpf = soDigitos(input.cpf);
  if (cpf.length !== 11) return { error: "CPF deve ter 11 dígitos." };
  const { data, error } = await supabase
    .from("irpf_contribuintes")
    .insert({ ...dados, cpf })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Já existe contribuinte com este CPF." };
    return { error: error.message };
  }
  revalidar();
  return { ok: true, id: data.id };
}

/** Cria a declaração de um exercício para um contribuinte (fora da abertura em lote). */
export async function criarDeclaracaoAction(input: {
  contribuinteId: string;
  exercicio: number;
}): Promise<{ ok: true; id: string } | Erro> {
  await requireSomaStaff();
  const supabase = await createClient();
  const { data: existe } = await supabase
    .from("irpf_declaracoes")
    .select("id")
    .eq("contribuinte_id", input.contribuinteId)
    .eq("exercicio", input.exercicio)
    .maybeSingle();
  if (existe) return { ok: true, id: existe.id };
  const { data: c } = await supabase
    .from("irpf_contribuintes")
    .select("responsavel_id")
    .eq("id", input.contribuinteId)
    .maybeSingle();
  const { data, error } = await supabase
    .from("irpf_declaracoes")
    .insert({
      contribuinte_id: input.contribuinteId,
      exercicio: input.exercicio,
      status: "NAO_INICIADA",
      responsavel_id: c?.responsavel_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Falha ao criar a declaração." };
  await sugerirChecklistAction(data.id);
  revalidar(data.id);
  return { ok: true, id: data.id };
}

/**
 * Documento que o cliente mandou antes de a declaração começar (ex.: informe
 * recebido em dezembro para o IRPF de março): guarda na declaração do
 * exercício escolhido, criando-a (Não iniciada, com checklist) se preciso.
 */
export async function enviarDocumentoContribuinteAction(input: {
  contribuinteId: string;
  exercicio: number;
  pathname: string;
  nome: string;
  tamanho: number;
  descricao?: string | null;
}): Promise<{ ok: true; declaracaoId: string } | Erro> {
  await requireSomaStaff();
  if (!Number.isInteger(input.exercicio) || input.exercicio < 2020 || input.exercicio > 2100) {
    return { error: "Exercício inválido." };
  }
  const decl = await criarDeclaracaoAction({ contribuinteId: input.contribuinteId, exercicio: input.exercicio });
  if ("error" in decl) return decl;
  const r = await registrarDocumentoAction({
    declaracaoId: decl.id,
    pathname: input.pathname,
    nome: input.nome,
    tamanho: input.tamanho,
    descricao: input.descricao,
  });
  if ("error" in r) return r;
  revalidatePath(`/irpf/contribuintes/${input.contribuinteId}`);
  return { ok: true, declaracaoId: decl.id };
}
