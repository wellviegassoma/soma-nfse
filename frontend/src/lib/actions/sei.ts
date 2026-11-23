"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import type { ActionState } from "@/lib/actions/auth";
import { IBGE_PETROPOLIS } from "@/lib/sei-labels";

const SITUACOES = ["EM_ANDAMENTO", "EXIGENCIA", "LICENCA_EMITIDA", "CONCLUIDO"] as const;

// ---------------------------------------------------------------------------
// Processo manual (só clientes de Petrópolis) — docs/sei.md
// ---------------------------------------------------------------------------

const NovoManual = z.object({
  companyId: z.string().uuid("Escolha o cliente."),
  origem: z.enum(["SEI", "FISICO"]),
  numero: z.string().trim().min(3, "Informe o número.").max(60),
  tipo: z.string().trim().min(2, "Informe o tipo.").max(200),
  dataEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de entrada."),
  situacao: z.enum(SITUACOES),
  observacao: z.string().trim().max(2000).optional(),
});

export async function criarProcessoManualSei(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermissao("legalizacao.editar");
  const tipoEscolhido = String(formData.get("tipo") ?? "");
  const parsed = NovoManual.safeParse({
    companyId: formData.get("companyId"),
    origem: formData.get("origem"),
    numero: formData.get("numero"),
    tipo: tipoEscolhido === "OUTRO" ? formData.get("tipoOutro") : tipoEscolhido,
    dataEntrada: formData.get("dataEntrada"),
    situacao: formData.get("situacao"),
    observacao: formData.get("observacao") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const d = parsed.data;

  let numero = d.numero;
  if (d.origem === "SEI") {
    numero = numero.toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{2,6}\.\d{4,7}\/\d{4}$/.test(numero)) {
      return { error: "Número do SEI no formato PMP.000123/2026." };
    }
  }

  const supabase = await createClient();
  const { data: empresa } = await supabase
    .from("companies")
    .select("id, ativa, municipality_ibge_code, municipality_name")
    .eq("id", d.companyId)
    .maybeSingle();
  const ehPetropolis =
    !!empresa &&
    (String(empresa.municipality_ibge_code ?? "") === IBGE_PETROPOLIS ||
      /^petr.polis$/i.test(String(empresa.municipality_name ?? "")));
  if (!empresa?.ativa || !ehPetropolis) {
    return { error: "Processo manual é só para clientes ativos de Petrópolis. Outros municípios: Alvarás e licenças › Renovações." };
  }

  const { data: existente } = await supabase.from("sei_processos").select("id").eq("numero", numero).maybeSingle();
  if (existente) return { error: `O processo ${numero} já está cadastrado.` };

  const { data: user } = await supabase.auth.getUser();
  const agora = new Date().toISOString();
  const descricao = `Cadastrado manualmente na SOMA (${d.origem === "SEI" ? "SEI sem acesso da SOMA" : "protocolo físico/fora do SEI"}).`;
  const dataHora = `${d.dataEntrada}T12:00:00-03:00`;

  const { data: proc, error } = await supabase
    .from("sei_processos")
    .insert({
      numero,
      tipo: d.tipo,
      origem: d.origem,
      company_id: d.companyId,
      vinculo_origem: "MANUAL",
      situacao: d.situacao,
      data_geracao: d.dataEntrada,
      data_entrada: d.dataEntrada,
      observacao: d.observacao ?? null,
      cadastrado_em: agora,
      cadastrado_por: user.user?.id ?? null,
      ultimo_andamento_em: dataHora,
      ultimo_andamento_unidade: "SOMA",
      ultimo_andamento_texto: descricao,
      updated_at: agora,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  await supabase.from("sei_andamentos").insert({
    processo_id: proc.id,
    data_hora: dataHora,
    unidade: "SOMA",
    descricao,
    chave: randomUUID(),
    manual: true,
    criado_por: user.user?.id ?? null,
  });

  revalidatePath("/legalizacao/sei", "layout");
  redirect(`/legalizacao/sei/${proc.id}`);
}

/** Situação à mão: só para processo que a sincronização ainda não assumiu. */
export async function atualizarSituacaoManualSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const situacao = z.enum(SITUACOES).parse(formData.get("situacao"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("sei_processos")
    .update({ situacao, updated_at: new Date().toISOString() })
    .eq("id", processoId)
    .is("sincronizado_em", null);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

/** Andamento lançado à mão (ligação, ida ao balcão, exigência recebida por fora…). */
export async function lancarAndamentoManualSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("data"));
  const hora = String(formData.get("hora") ?? "").match(/^\d{2}:\d{2}$/)?.[0] ?? "12:00";
  const descricao = z.string().trim().min(2).max(5000).parse(formData.get("descricao"));
  const dataHora = `${data}T${hora}:00-03:00`;

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase.from("sei_andamentos").insert({
    processo_id: processoId,
    data_hora: dataHora,
    unidade: "SOMA",
    descricao,
    chave: randomUUID(),
    manual: true,
    criado_por: user.user?.id ?? null,
  });
  if (error) throw error;

  // Processo manual: o "último andamento" vem das anotações (a sincronização
  // recalcula a partir do SEI quando assume o processo).
  const { data: p } = await supabase
    .from("sei_processos")
    .select("sincronizado_em, ultimo_andamento_em")
    .eq("id", processoId)
    .maybeSingle();
  if (p && !p.sincronizado_em && (!p.ultimo_andamento_em || new Date(dataHora) >= new Date(p.ultimo_andamento_em))) {
    await supabase
      .from("sei_processos")
      .update({ ultimo_andamento_em: dataHora, ultimo_andamento_unidade: "SOMA", ultimo_andamento_texto: descricao })
      .eq("id", processoId);
  }
  revalidatePath("/legalizacao/sei", "layout");
}

export async function excluirAndamentoManualSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const id = z.string().uuid().parse(formData.get("andamentoId"));
  const supabase = await createClient();
  const { error } = await supabase.from("sei_andamentos").delete().eq("id", id).eq("manual", true);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

/** Registra um anexo que o navegador já subiu ao Blob (pathname sei/manual/...). */
export async function registrarAnexoManualSei(input: {
  processoId: string;
  pathname: string;
  nome: string;
  tamanho: number;
  mime: string;
  tipo: string | null;
}): Promise<{ ok: true } | { error: string }> {
  await requirePermissao("legalizacao.editar");
  const ok = z
    .object({
      processoId: z.string().uuid(),
      pathname: z.string().startsWith("sei/manual/"),
      nome: z.string().min(1).max(300),
      tamanho: z.number().int().nonnegative(),
      mime: z.string().max(200),
      tipo: z.string().max(300).nullable(),
    })
    .safeParse(input);
  if (!ok.success) return { error: "Dados do anexo inválidos." };
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const { error } = await supabase.from("sei_documentos").insert({
    processo_id: input.processoId,
    numero_sei: `M-${randomUUID().slice(0, 8)}`,
    ordem: 100000 + Math.floor(Date.now() / 1000) % 100000,
    tipo: input.tipo || input.nome,
    data: hoje,
    unidade: "SOMA",
    mime: input.mime || "application/octet-stream",
    tamanho: input.tamanho,
    nome_arquivo: input.nome,
    blob_pathname: input.pathname,
    baixado_em: new Date().toISOString(),
    manual: true,
    criado_por: user.user?.id ?? null,
  });
  if (error) return { error: error.message };
  revalidatePath("/legalizacao/sei", "layout");
  return { ok: true };
}

export async function excluirAnexoManualSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const id = z.string().uuid().parse(formData.get("documentoId"));
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("sei_documentos")
    .select("blob_pathname")
    .eq("id", id)
    .eq("manual", true)
    .maybeSingle();
  if (!doc) return;
  const { error } = await supabase.from("sei_documentos").delete().eq("id", id).eq("manual", true);
  if (error) throw error;
  if (doc.blob_pathname) await del(doc.blob_pathname).catch(() => {});
  revalidatePath("/legalizacao/sei", "layout");
}

/** Vínculo manual de um processo do SEI a um cliente (nunca sobrescrito pela sincronização). */
export async function vincularProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const companyIdBruto = String(formData.get("companyId") ?? "");
  const companyId = companyIdBruto ? z.string().uuid().parse(companyIdBruto) : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("sei_processos")
    .update({
      company_id: companyId,
      // Desvincular volta para o automático na próxima sincronização.
      vinculo_origem: companyId ? "MANUAL" : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei");
  revalidatePath(`/legalizacao/sei/${processoId}`);
}

/** Arquiva: some das listas e a extensão deixa de abrir o processo no SEI. */
export async function arquivarProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const motivo = z.string().trim().min(1).max(200).parse(formData.get("motivo"));
  const obs = String(formData.get("observacao") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_processos")
    .update({
      arquivado_em: new Date().toISOString(),
      arquivado_por: user.user?.id ?? null,
      motivo_arquivamento: obs ? `${motivo} — ${obs}` : motivo,
    })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

export async function desarquivarProcessoSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("sei_processos")
    .update({ arquivado_em: null, arquivado_por: null, motivo_arquivamento: null })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

const MOTIVOS_DISPENSA = ["PONTO_REFERENCIA", "SEM_ATENDIMENTO_LOCAL", "ATIVIDADE_DISPENSADA", "PROCESSO_FORA_SEI", "OUTRO"] as const;

/** Cliente de Petrópolis conferido: não precisa de processo no SEI. */
export async function dispensarClienteSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const motivo = z.enum(MOTIVOS_DISPENSA).parse(formData.get("motivo"));
  const observacao = String(formData.get("observacao") ?? "").trim().slice(0, 500) || null;
  if (motivo === "OUTRO" && !observacao) throw new Error("Explique o motivo na observação.");
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_cobertura_dispensas")
    .upsert({ company_id: companyId, motivo, observacao, criado_por: user.user?.id ?? null, created_at: new Date().toISOString() }, { onConflict: "company_id" });
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

export async function desfazerDispensaSei(formData: FormData) {
  await requirePermissao("legalizacao.editar");
  const companyId = z.string().uuid().parse(formData.get("companyId"));
  const supabase = await createClient();
  const { error } = await supabase.from("sei_cobertura_dispensas").delete().eq("company_id", companyId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei", "layout");
}

/** Tira o selo "novidade" do processo. */
export async function marcarSeiVisto(formData: FormData) {
  await requirePermissao("legalizacao.ver");
  const processoId = z.string().uuid().parse(formData.get("processoId"));
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("sei_processos")
    .update({ visto_em: new Date().toISOString(), visto_por: user.user?.id ?? null })
    .eq("id", processoId);
  if (error) throw error;
  revalidatePath("/legalizacao/sei");
  revalidatePath(`/legalizacao/sei/${processoId}`);
}
