import { NextResponse } from "next/server";
import { z } from "zod";
import { autorizarApi } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  chaveAndamento,
  classificarSituacao,
  dataHoraSei,
  dataSei,
  encontrarEmpresa,
  lerFormulario,
  ultimoAndamentoRelevante,
} from "@/lib/sei";

// Recebe da extensão "SOMA · SEI" o que ela leu no SEI logado (docs/sei.md).
// Ações: iniciar → processo (1 por processo) → documento (1 por arquivo
// baixado) → finalizar. Usa a sessão do SOMA do próprio Chrome; RLS vale.

const Iniciar = z.object({ acao: z.literal("iniciar") });

const Processo = z.object({
  acao: z.literal("processo"),
  sincronizacao_id: z.string().uuid(),
  // Acesso expirado que não abre mais: só registra que o processo existe.
  somente_registro: z.boolean().optional(),
  processo: z.object({
    numero: z.string().regex(/^[A-Z]+\.\d+\/\d{4}$/),
    tipo: z.string().max(300).nullable(),
    data_geracao: z.string().nullable(),
    nivel_acesso: z.string().max(100).nullable(),
    interessados: z.array(z.string().max(300)).max(50),
    acesso_validade: z.string().nullable(),
    acesso_expirado: z.boolean(),
  }),
  formulario_texto: z.string().max(100_000).nullable(),
  documentos: z
    .array(
      z.object({
        numero_sei: z.string().regex(/^\d{5,10}$/),
        ordem: z.number().int(),
        tipo: z.string().max(500).nullable(),
        data: z.string().nullable(),
        unidade: z.string().max(200).nullable(),
      }),
    )
    .max(2000),
  andamentos: z
    .array(z.object({ data_hora: z.string(), unidade: z.string().max(200), descricao: z.string().max(20_000) }))
    .max(5000),
});

const Documento = z.object({
  acao: z.literal("documento"),
  processo_id: z.string().uuid(),
  numero_sei: z.string().regex(/^\d{5,10}$/),
  blob_pathname: z.string().startsWith("sei/"),
  mime: z.string().max(200),
  tamanho: z.number().int().nonnegative(),
  nome_arquivo: z.string().max(300),
});

// Documentos listados que o acesso externo da SOMA não deixa abrir (sem link).
const SemAcesso = z.object({
  acao: z.literal("sem_acesso"),
  processo_id: z.string().uuid(),
  numeros_sei: z.array(z.string().regex(/^\d{5,10}$/)).max(2000),
});

const Finalizar = z.object({
  acao: z.literal("finalizar"),
  sincronizacao_id: z.string().uuid(),
  processos: z.number().int(),
  documentos_novos: z.number().int(),
  andamentos_novos: z.number().int(),
  erros: z.array(z.object({ onde: z.string().max(200), erro: z.string().max(2000) })).max(500),
  interrompida: z.boolean().optional(),
});

const Corpo = z.discriminatedUnion("acao", [Iniciar, Processo, Documento, SemAcesso, Finalizar]);

export async function POST(request: Request) {
  const negado = await autorizarApi("legalizacao.editar");
  if (negado) return negado;

  const parsed = Corpo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos.", detalhes: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const corpo = parsed.data;
  const supabase = await createClient();

  try {
    switch (corpo.acao) {
      case "iniciar": {
        const { data: user } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from("sei_sincronizacoes")
          .insert({ usuario_id: user.user?.id ?? null })
          .select("id")
          .single();
        if (error) throw error;
        // Arquivados: a extensão nem abre no SEI.
        const { data: arquivados, error: erroArq } = await supabase
          .from("sei_processos")
          .select("numero")
          .not("arquivado_em", "is", null)
          .limit(5000);
        if (erroArq) throw erroArq;
        return NextResponse.json({ sincronizacao_id: data.id, arquivados: (arquivados ?? []).map((a) => a.numero) });
      }

      case "processo":
        return NextResponse.json(await gravarProcesso(supabase, corpo));

      case "documento": {
        const { error } = await supabase
          .from("sei_documentos")
          .update({
            blob_pathname: corpo.blob_pathname,
            mime: limparMime(corpo.mime),
            tamanho: corpo.tamanho,
            nome_arquivo: corpo.nome_arquivo,
            baixado_em: new Date().toISOString(),
            sem_acesso_em: null,
          })
          .eq("processo_id", corpo.processo_id)
          .eq("numero_sei", corpo.numero_sei);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }

      case "sem_acesso": {
        if (corpo.numeros_sei.length) {
          const { error } = await supabase
            .from("sei_documentos")
            .update({ sem_acesso_em: new Date().toISOString() })
            .eq("processo_id", corpo.processo_id)
            .in("numero_sei", corpo.numeros_sei)
            .is("blob_pathname", null);
          if (error) throw error;
        }
        return NextResponse.json({ ok: true });
      }

      case "finalizar": {
        const { error } = await supabase
          .from("sei_sincronizacoes")
          .update({
            finalizado_em: new Date().toISOString(),
            processos: corpo.processos,
            documentos_novos: corpo.documentos_novos,
            andamentos_novos: corpo.andamentos_novos,
            erros: corpo.erros,
            status: corpo.interrompida ? "INTERROMPIDA" : corpo.erros.length ? "COM_ERROS" : "OK",
          })
          .eq("id", corpo.sincronizacao_id);
        if (error) throw error;
        return NextResponse.json({ ok: true });
      }
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : (error as { message?: string })?.message ?? String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** O SEI manda coisas como "text/html;;charset=ISO-8859-1" e "application/pdf;". */
function limparMime(mime: string): string {
  return mime
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .join("; ");
}

type Supa = Awaited<ReturnType<typeof createClient>>;

async function gravarProcesso(supabase: Supa, corpo: z.infer<typeof Processo>) {
  const p = corpo.processo;
  const agora = new Date().toISOString();

  const { data: existente, error: erroExistente } = await supabase
    .from("sei_processos")
    .select("id, company_id, vinculo_origem")
    .eq("numero", p.numero)
    .maybeSingle();
  if (erroExistente) throw erroExistente;

  if (corpo.somente_registro) {
    // Não sobrescreve o que já foi lido quando o acesso ainda abria.
    const base = {
      acesso_validade: dataSei(p.acesso_validade),
      acesso_expirado: true,
      sincronizado_em: agora,
      updated_at: agora,
    };
    if (existente) {
      const { error } = await supabase.from("sei_processos").update(base).eq("id", existente.id);
      if (error) throw error;
      return { processo_id: existente.id, andamentos_novos: 0, documentos_faltando: [], vinculo: existente.vinculo_origem };
    }
    const { data, error } = await supabase
      .from("sei_processos")
      .insert({ numero: p.numero, ...base })
      .select("id")
      .single();
    if (error) throw error;
    return { processo_id: data.id as string, andamentos_novos: 0, documentos_faltando: [], vinculo: null };
  }

  // Andamentos normalizados, mais recente primeiro (o SEI já lista assim).
  const andamentos = corpo.andamentos
    .map((a) => {
      const data_hora = dataHoraSei(a.data_hora);
      if (!data_hora) return null;
      const descricao = a.descricao.trim();
      const unidade = a.unidade.trim();
      return { data_hora, unidade, descricao, chave: chaveAndamento({ data_hora, unidade, descricao }) };
    })
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .sort((a, b) => b.data_hora.localeCompare(a.data_hora));

  const form = corpo.formulario_texto ? lerFormulario(corpo.formulario_texto) : { nome: null, documento: null, im: null };

  let companyId = existente?.company_id ?? null;
  let vinculoOrigem = existente?.vinculo_origem ?? null;
  if (vinculoOrigem !== "MANUAL") {
    let empresasCache: Awaited<ReturnType<typeof carregar>> | null = null;
    const carregar = async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, legal_name, trade_name, municipal_registration")
        .limit(5000);
      if (error) throw error;
      return data ?? [];
    };
    const achou = await encontrarEmpresa(supabase, form, p.interessados, async () => (empresasCache ??= await carregar()));
    companyId = achou?.companyId ?? null;
    vinculoOrigem = achou?.origem ?? null;
  }

  const ultimo = ultimoAndamentoRelevante(andamentos);
  const linha = {
    numero: p.numero,
    tipo: p.tipo,
    data_geracao: dataSei(p.data_geracao),
    nivel_acesso: p.nivel_acesso,
    interessados: p.interessados,
    requerente_nome: form.nome,
    requerente_documento: form.documento && /^\d{11}(\d{3})?$/.test(form.documento) ? form.documento : null,
    requerente_im: form.im,
    company_id: companyId,
    vinculo_origem: vinculoOrigem,
    acesso_validade: dataSei(p.acesso_validade),
    acesso_expirado: p.acesso_expirado,
    situacao: classificarSituacao(andamentos),
    ultimo_andamento_em: ultimo?.data_hora ?? null,
    ultimo_andamento_unidade: ultimo?.unidade ?? null,
    ultimo_andamento_texto: ultimo?.descricao ?? null,
    sincronizado_em: agora,
    updated_at: agora,
  };

  const { data: proc, error: erroProc } = await supabase
    .from("sei_processos")
    .upsert(linha, { onConflict: "numero" })
    .select("id")
    .single();
  if (erroProc) throw erroProc;
  const processoId = proc.id as string;

  // Andamentos: só insere os que não existem (chave), e conta os novos.
  let andamentosNovos = 0;
  if (andamentos.length) {
    const { data: inseridos, error } = await supabase
      .from("sei_andamentos")
      .upsert(
        andamentos.map((a) => ({ processo_id: processoId, ...a })),
        { onConflict: "processo_id,chave", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw error;
    andamentosNovos = inseridos?.length ?? 0;
  }
  // Novidade só quando o processo já existia (a carga inicial não é novidade).
  if (existente && andamentosNovos > 0) {
    const { error } = await supabase.from("sei_processos").update({ novidade_em: agora }).eq("id", processoId);
    if (error) throw error;
  }

  // Documentos: metadados sempre atualizados; o arquivo vem depois, um a um.
  if (corpo.documentos.length) {
    const { error } = await supabase.from("sei_documentos").upsert(
      corpo.documentos.map((d) => ({
        processo_id: processoId,
        numero_sei: d.numero_sei,
        ordem: d.ordem,
        tipo: d.tipo,
        data: dataSei(d.data),
        unidade: d.unidade,
      })),
      { onConflict: "processo_id,numero_sei" },
    );
    if (error) throw error;
  }
  const { data: faltando, error: erroFaltando } = await supabase
    .from("sei_documentos")
    .select("numero_sei")
    .eq("processo_id", processoId)
    .is("blob_pathname", null);
  if (erroFaltando) throw erroFaltando;

  return {
    processo_id: processoId,
    andamentos_novos: andamentosNovos,
    documentos_faltando: (faltando ?? []).map((d) => d.numero_sei as string),
    vinculo: vinculoOrigem,
  };
}
