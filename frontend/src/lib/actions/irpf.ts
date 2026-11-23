"use server";

import { revalidatePath } from "next/cache";
import { del, get } from "@vercel/blob";
import { createClient } from "@/lib/supabase/server";
import { requireIrpfAccess, requireUser } from "@/lib/auth";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { encryptSecret, decryptSecret, toBytea, fromBytea } from "@/lib/certificate";
import { logAudit } from "@/lib/audit";
import { lerDec, decodificarArquivo, DecInvalidoError, type ResumoDeclaracao } from "@/lib/irpf/dec-parser";
import { linhasDoPdf } from "@/lib/irpf/pdf-linhas";
import {
  PdfIrpfInvalidoError,
  juntarDeclaracaoRecibo,
  lerDeclaracaoPdf,
  lerReciboPdf,
  resumoDoRecibo,
  type ReciboPdf,
} from "@/lib/irpf/pdf-parser";
import {
  CHECKLIST_STATUS,
  HONORARIO_STATUS,
  SITUACAO_RECEITA,
  type SituacaoReceita,
  STATUS_DECLARACAO,
  camposCadastro,
  resumoParaGravar,
  valorReajustado,
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
 * a que chegou por último (é o trabalho em andamento). Um resumo só de
 * recibo nunca substitui um completo, e um PDF da mesma entrega não
 * substitui o lido do .DEC (o .DEC é mais completo).
 */
function substitui(atual: ResumoGravado | null, nova: ResumoDeclaracao): boolean {
  if (!atual) return true;
  const a = chaveTransmissao(atual);
  const n = chaveTransmissao(nova);
  if (nova.parcial && !atual.parcial) return false;
  if (a && n && a === n && (atual.origem ?? "DEC") === "DEC" && nova.origem !== "DEC") return false;
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
      resumo: {
        nome: string;
        exercicio: number;
        completa: boolean;
        retificadora: boolean;
        resultado: ResumoDeclaracao["resultado"];
        valor: number;
        parcial: boolean;
        transmitida: boolean;
      };
    }
  | Erro;

type ArquivoImportado = {
  tipo: "DEC" | "REC" | "DOCUMENTO";
  pathname: string;
  nome: string;
  tamanho: number;
  descricao?: string;
};

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
  await requireIrpfAccess();
  if (!pathnameValido(input.decPathname)) return { error: "Arquivo inválido." };
  if (input.recPathname && !pathnameValido(input.recPathname)) return { error: "Recibo inválido." };

  let resumo: ResumoDeclaracao;
  const arquivos: ArquivoImportado[] = [];
  try {
    const dec = await lerBlobTexto(input.decPathname);
    arquivos.push({ tipo: "DEC", pathname: input.decPathname, nome: input.decNome, tamanho: dec.tamanho });
    const rec = input.recPathname ? await lerBlobTexto(input.recPathname) : null;
    if (rec && input.recPathname) {
      arquivos.push({ tipo: "REC", pathname: input.recPathname, nome: input.recNome || "recibo.REC", tamanho: rec.tamanho });
    }
    resumo = lerDec(dec.texto, rec?.texto ?? null);
  } catch (e) {
    await del([input.decPathname, ...(input.recPathname ? [input.recPathname] : [])]).catch(() => {});
    if (e instanceof DecInvalidoError) return { error: e.message };
    return { error: e instanceof Error ? e.message : "Falha ao ler o arquivo." };
  }
  return gravarImportacao(resumo, arquivos);
}

/**
 * Importa a declaração e/ou o recibo em PDF (os PDFs que o programa do IRPF
 * gera). O tipo de cada PDF é reconhecido pelo conteúdo. Só o recibo dá um
 * resumo parcial (totais, número e data de entrega).
 */
export async function importarPdfAction(input: {
  arquivos: { pathname: string; nome: string }[];
}): Promise<ResultadoImportacao> {
  await requireIrpfAccess();
  const lista = input.arquivos.slice(0, 2);
  if (!lista.length || lista.some((a) => !pathnameValido(a.pathname))) return { error: "Arquivo inválido." };
  const apagar = () => del(lista.map((a) => a.pathname)).catch(() => {});

  let declaracao: ResumoDeclaracao | null = null;
  let recibo: ReciboPdf | null = null;
  const arquivos: ArquivoImportado[] = [];
  try {
    for (const a of lista) {
      const blob = await get(a.pathname, { access: "private" });
      if (!blob || blob.statusCode !== 200) throw new Error("Arquivo não encontrado no Blob.");
      const bytes = new Uint8Array(await new Response(blob.stream).arrayBuffer());
      const linhas = await linhasDoPdf(bytes);
      const ehRecibo = linhas.some((l) => /RECIBO DE ENTREGA DA DECLARA/i.test(l.texto));
      if (ehRecibo) recibo = lerReciboPdf(linhas);
      else declaracao = lerDeclaracaoPdf(linhas);
      arquivos.push({
        tipo: "DOCUMENTO",
        pathname: a.pathname,
        nome: a.nome,
        tamanho: bytes.byteLength,
        descricao: ehRecibo ? "Recibo de entrega (PDF)" : "Declaração (PDF)",
      });
    }
  } catch (e) {
    await apagar();
    if (e instanceof PdfIrpfInvalidoError) return { error: e.message };
    console.error("[irpf] falha ao ler PDF:", e instanceof Error ? e.message : e);
    return { error: "Não consegui ler o PDF (arquivo vazio, protegido ou corrompido)." };
  }

  let resumo: ResumoDeclaracao;
  try {
    if (declaracao && recibo) resumo = juntarDeclaracaoRecibo(declaracao, recibo);
    else if (declaracao) resumo = declaracao;
    else resumo = resumoDoRecibo(recibo!);
  } catch (e) {
    await apagar();
    return { error: e instanceof Error ? e.message : "PDFs incompatíveis." };
  }
  return gravarImportacao(resumo, arquivos);
}

async function gravarImportacao(resumo: ResumoDeclaracao, arquivos: ArquivoImportado[]): Promise<ResultadoImportacao> {
  const user = await requireUser();
  const supabase = await createClient();
  const principal = arquivos[0];
  const transmitida = !!(resumo.numeroRecibo && resumo.transmissao);
  const resumoCurto = {
    nome: resumo.nome,
    exercicio: resumo.exercicio,
    completa: resumo.completa,
    retificadora: resumo.retificadora,
    resultado: resumo.resultado,
    valor: resumo.resultado === "PAGAR" ? resumo.totais.impostoPagar : resumo.totais.impostoRestituir,
    parcial: !!resumo.parcial,
    transmitida,
  };

  // Cadastro vindo do PDF é parcial (sem banco, título…): só preenche o que leu.
  const cadastro = resumo.parcial
    ? {}
    : resumo.origem === "DEC"
      ? camposCadastro(resumo)
      : Object.fromEntries(Object.entries(camposCadastro(resumo)).filter(([, v]) => v !== null && v !== false));

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
      Object.assign(completar, cadastro);
    }
    if (!existente.email && resumo.email) completar.email = resumo.email;
    if (!existente.telefone && resumo.telefone) completar.telefone = resumo.telefone;
    if (!existente.nascimento && resumo.nascimento) completar.nascimento = resumo.nascimento;
    if (Object.keys(completar).length) {
      await supabase.from("irpf_contribuintes").update(completar).eq("id", contribuinteId);
    }
  } else {
    if (!resumo.nome) return { error: "O PDF não traz o nome do contribuinte." };
    const { data: novo, error } = await supabase
      .from("irpf_contribuintes")
      .insert({
        nome: resumo.nome,
        cpf: resumo.cpf,
        nascimento: resumo.nascimento,
        email: resumo.email,
        telefone: resumo.telefone,
        ...cadastro,
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

  // Mesmo arquivo já importado? (nome + tamanho do principal) — não duplica.
  if (declaracaoId) {
    const { data: repetido } = await supabase
      .from("irpf_arquivos")
      .select("id")
      .eq("declaracao_id", declaracaoId)
      .eq("tipo", principal.tipo)
      .eq("nome_arquivo", principal.nome)
      .eq("tamanho", principal.tamanho)
      .limit(1);
    if (repetido?.length) {
      await del(arquivos.map((a) => a.pathname)).catch(() => {});
      return { ok: true, declaracaoId, contribuinteNovo, acao: "REPETIDA", resumo: resumoCurto };
    }
  }

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

  const { error: e3 } = await supabase.from("irpf_arquivos").insert(
    arquivos.map((a) => ({
      declaracao_id: declaracaoId,
      tipo: a.tipo,
      blob_pathname: a.pathname,
      nome_arquivo: a.nome,
      tamanho: a.tamanho,
      retificadora: resumo.retificadora,
      descricao: a.descricao ?? null,
      uploaded_by: user.id,
    })),
  );
  if (e3) return { error: e3.message };

  const fonte = resumo.origem === "DEC" ? "" : resumo.parcial ? " (recibo em PDF)" : " (PDF)";
  await supabase.from("irpf_eventos").insert({
    declaracao_id: declaracaoId,
    user_id: user.id,
    tipo: "IMPORTACAO",
    comentario: `${resumo.retificadora ? "Retificadora" : "Original"} ${transmitida ? "transmitida" : "gravada"}${fonte} — ${
      acao === "MANTIDA" ? "arquivo guardado; o resumo continua o da versão mais recente" : "resumo atualizado"
    }`,
  });

  revalidar(declaracaoId);
  return { ok: true, declaracaoId, contribuinteNovo, acao, resumo: resumoCurto };
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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
  await requireIrpfAccess();
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

// ------------------------------------------------------------- financeiro

/** Salva o honorário de uma declaração (valor, situação, vencimento, pagamento). */
export async function salvarHonorarioAction(input: {
  id: string;
  valor: number | null;
  status: HonorarioStatus;
  vencimento: string | null; // AAAA-MM-DD
  pagoEm: string | null;
  forma: string | null;
}): Promise<{ ok: true; pagoEm: string | null } | Erro> {
  await requireIrpfAccess();
  const user = await requireUser();
  if (!HONORARIO_STATUS.includes(input.status)) return { error: "Situação inválida." };
  if (input.valor !== null && (!Number.isFinite(input.valor) || input.valor < 0)) return { error: "Valor inválido." };
  const data = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const pagoEm = input.status === "PAGO" ? data(input.pagoEm) ?? hoje : null;

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("irpf_declaracoes")
    .select("honorario_valor, honorario_status")
    .eq("id", input.id)
    .maybeSingle();
  if (!antes) return { error: "Declaração não encontrada." };
  const { error } = await supabase
    .from("irpf_declaracoes")
    .update({
      honorario_valor: input.valor,
      honorario_status: input.status,
      honorario_vencimento: data(input.vencimento),
      honorario_pago_em: pagoEm,
      honorario_forma: input.forma?.trim() || null,
    })
    .eq("id", input.id);
  if (error) return { error: error.message };

  const eventos = [];
  const valorAntes = antes.honorario_valor === null ? null : Number(antes.honorario_valor);
  if (valorAntes !== input.valor) {
    eventos.push({ tipo: "HONORARIO", de: valorAntes === null ? null : String(valorAntes), para: input.valor === null ? null : String(input.valor) });
  }
  if (antes.honorario_status !== input.status) {
    eventos.push({ tipo: "HONORARIO", de: antes.honorario_status, para: input.status });
  }
  if (eventos.length) {
    await supabase.from("irpf_eventos").insert(eventos.map((e) => ({ ...e, declaracao_id: input.id, user_id: user.id })));
  }
  revalidar(input.id);
  return { ok: true, pagoEm };
}

/**
 * Reajuste anual em lote: honorário do exercício = honorário do exercício
 * anterior + percentual (arredondado). Quem não tem histórico pode receber um
 * valor padrão. Por padrão só preenche quem ainda está sem valor.
 */
export async function aplicarReajusteAction(input: {
  exercicio: number;
  percentual: number;
  arredondar: number;
  valorPadrao: number | null;
  sobrescrever: boolean;
}): Promise<{ ok: true; alteradas: number } | Erro> {
  await requireIrpfAccess();
  const user = await requireUser();
  if (!Number.isFinite(input.percentual) || input.percentual < -50 || input.percentual > 200) return { error: "Percentual inválido." };
  if (![0, 1, 5, 10, 50].includes(input.arredondar)) return { error: "Arredondamento inválido." };
  if (input.valorPadrao !== null && (!Number.isFinite(input.valorPadrao) || input.valorPadrao < 0)) return { error: "Valor padrão inválido." };
  const supabase = await createClient();

  const atuais = await buscarTudoPaginado<{ id: string; contribuinte_id: string; honorario_valor: number | null; status: string }>(
    (from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select("id, contribuinte_id, honorario_valor, status")
        .eq("exercicio", input.exercicio)
        .order("id")
        .range(from, to),
  );
  const anteriores = await buscarTudoPaginado<{ contribuinte_id: string; honorario_valor: number | null }>((from, to) =>
    supabase
      .from("irpf_declaracoes")
      .select("contribuinte_id, honorario_valor")
      .eq("exercicio", input.exercicio - 1)
      .order("id")
      .range(from, to),
  );
  const base = new Map(anteriores.filter((a) => a.honorario_valor !== null).map((a) => [a.contribuinte_id, Number(a.honorario_valor)]));

  const mudancas: { id: string; de: number | null; para: number }[] = [];
  for (const d of atuais) {
    if (d.status === "NAO_FARA") continue;
    if (!input.sobrescrever && d.honorario_valor !== null) continue;
    const b = base.get(d.contribuinte_id);
    const novo = b !== undefined ? valorReajustado(b, input.percentual, input.arredondar) : input.valorPadrao;
    if (novo === null || novo === undefined) continue;
    const de = d.honorario_valor === null ? null : Number(d.honorario_valor);
    if (de !== novo) mudancas.push({ id: d.id, de, para: novo });
  }
  // Um update por valor distinto (poucos valores na prática).
  const porValor = new Map<number, string[]>();
  for (const m of mudancas) porValor.set(m.para, [...(porValor.get(m.para) ?? []), m.id]);
  for (const [valor, ids] of porValor) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("irpf_declaracoes").update({ honorario_valor: valor }).in("id", ids.slice(i, i + 200));
      if (error) return { error: error.message };
    }
  }
  if (mudancas.length) {
    const comentario = `Reajuste em lote: ${input.percentual}% sobre ${input.exercicio - 1}`;
    for (let i = 0; i < mudancas.length; i += 500) {
      await supabase.from("irpf_eventos").insert(
        mudancas.slice(i, i + 500).map((m) => ({
          declaracao_id: m.id,
          user_id: user.id,
          tipo: "HONORARIO",
          de: m.de === null ? null : String(m.de),
          para: String(m.para),
          comentario,
        })),
      );
    }
  }
  revalidar();
  return { ok: true, alteradas: mudancas.length };
}

// ------------------------------------------------------------- gov.br e pós-entrega

/** Grava (ou apaga, com senha vazia) a senha do gov.br do contribuinte, cifrada. */
export async function salvarSenhaGovbrAction(input: { contribuinteId: string; senha: string }): Promise<{ ok: true } | Erro> {
  await requireIrpfAccess();
  const user = await requireUser();
  const senha = input.senha.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("irpf_contribuintes")
    .update({
      govbr_senha_cifrada: senha ? toBytea(encryptSecret(Buffer.from(senha, "utf8"))) : null,
      govbr_senha_atualizada_em: new Date().toISOString(),
      govbr_senha_atualizada_por: user.id,
    })
    .eq("id", input.contribuinteId);
  if (error) return { error: error.message };
  await logAudit({ action: senha ? "UPDATE" : "DELETE", entity: "irpf_senha_govbr", entityId: input.contribuinteId });
  revalidatePath(`/irpf/contribuintes/${input.contribuinteId}`);
  return { ok: true };
}

/** Revela a senha do gov.br. Toda revelação fica em audit_logs (quem e quando). */
export async function revelarSenhaGovbrAction(contribuinteId: string): Promise<{ senha: string } | Erro> {
  await requireIrpfAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("irpf_contribuintes")
    .select("govbr_senha_cifrada")
    .eq("id", contribuinteId)
    .maybeSingle();
  if (error || !data) return { error: "Contribuinte não encontrado." };
  if (!data.govbr_senha_cifrada) return { error: "Sem senha cadastrada." };
  let senha: string;
  try {
    senha = decryptSecret(fromBytea(data.govbr_senha_cifrada as string)).toString("utf8");
  } catch {
    return { error: "Não foi possível decifrar a senha." };
  }
  await logAudit({ action: "REVEAL", entity: "irpf_senha_govbr", entityId: contribuinteId });
  return { senha };
}

/** Situação na Receita depois da entrega (processada, pendência, malha...). */
export async function salvarSituacaoReceitaAction(input: {
  id: string;
  situacao: SituacaoReceita | null;
}): Promise<{ ok: true } | Erro> {
  await requireIrpfAccess();
  const user = await requireUser();
  if (input.situacao !== null && !SITUACAO_RECEITA.includes(input.situacao)) return { error: "Situação inválida." };
  const supabase = await createClient();
  const { data: antes } = await supabase.from("irpf_declaracoes").select("situacao_receita").eq("id", input.id).maybeSingle();
  if (!antes) return { error: "Declaração não encontrada." };
  if (antes.situacao_receita === input.situacao) return { ok: true };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { error } = await supabase
    .from("irpf_declaracoes")
    .update({ situacao_receita: input.situacao, situacao_receita_em: input.situacao ? hoje : null })
    .eq("id", input.id);
  if (error) return { error: error.message };
  await supabase.from("irpf_eventos").insert({
    declaracao_id: input.id,
    user_id: user.id,
    tipo: "RECEITA",
    de: antes.situacao_receita,
    para: input.situacao,
  });
  revalidar(input.id);
  return { ok: true };
}
