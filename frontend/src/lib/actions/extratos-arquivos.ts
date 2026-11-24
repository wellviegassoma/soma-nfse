"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { marcarRecebido, processarArquivo, type ResultadoProcessamento, type StatusMes } from "@/lib/extratos-arquivos";
import type { Leitura } from "@/lib/extratos-leitura-core";

const competencia = z.string().regex(/^\d{4}-\d{2}$/);

function revalidar(companyId?: string | null) {
  revalidatePath("/extratos");
  revalidatePath("/extratos/fila");
  if (companyId) revalidatePath(`/extratos/empresas/${companyId}`);
}

const receberSchema = z.object({
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1).max(500),
  nome: z.string().min(1).max(300),
  mime: z.string().max(120).nullable(),
  tamanho: z.number().int().nonnegative().nullable(),
  origem: z.enum(["UPLOAD", "LOTE"]),
  companyId: uuidLike.nullable().optional(),
  contaId: uuidLike.nullable().optional(),
  competencia: competencia.nullable().optional(),
});

/** Registra um arquivo recém-enviado ao Blob e já processa (leitura + identificação). */
export async function receberArquivoExtrato(
  input: z.input<typeof receberSchema>,
): Promise<{ error?: string; resultado?: ResultadoProcessamento }> {
  await requirePermissao("extratos.editar");
  const user = await requireUser();
  const p = receberSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  const v = p.data;
  if (!v.blobPathname.startsWith("extratos/")) return { error: "Arquivo inválido." };

  const db = await createClient();
  const { data: arq, error } = await db
    .from("extrato_arquivos")
    .insert({
      company_id: v.companyId ?? null,
      conta_id: v.contaId ?? null,
      competencia: v.competencia ?? null,
      blob_url: v.blobUrl,
      blob_pathname: v.blobPathname,
      nome_arquivo: v.nome,
      mime: v.mime,
      tamanho: v.tamanho,
      origem: v.origem,
      enviado_por: user.id,
    })
    .select("id")
    .single();
  if (error || !arq) return { error: "Não foi possível registrar o arquivo." };

  try {
    const resultado = await processarArquivo(db, arq.id as string, {
      companyId: v.companyId,
      contaId: v.contaId,
      competencia: v.competencia,
    });
    revalidar(resultado.companyId);
    return { resultado };
  } catch (e) {
    console.error("[extratos] falha ao processar:", e instanceof Error ? e.message : e);
    await db.from("extrato_arquivos").update({ situacao: "ERRO" }).eq("id", arq.id);
    revalidar(v.companyId);
    return { error: "Arquivo salvo, mas a leitura falhou. Ele ficou na fila." };
  }
}

const statusSchema = z.object({
  contaId: uuidLike,
  companyId: uuidLike,
  competencia,
  status: z.enum(["PENDENTE", "RECEBIDO", "CONFERIDO", "CONCILIADO", "SEM_MOVIMENTO", "ENCERRADA"]),
});

export async function definirStatusExtrato(input: z.input<typeof statusSchema>): Promise<{ error?: string }> {
  await requirePermissao("extratos.editar");
  const p = statusSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  const v = p.data;
  const db = await createClient();
  const { data: atual } = await db
    .from("extratos_mensais")
    .select("id, status")
    .eq("conta_id", v.contaId)
    .eq("competencia", v.competencia)
    .maybeSingle();
  const { error } = atual
    ? await db.from("extratos_mensais").update({ status: v.status }).eq("id", atual.id)
    : await db.from("extratos_mensais").insert({ conta_id: v.contaId, competencia: v.competencia, status: v.status });
  if (error) return { error: "Não foi possível mudar o status." };
  await logAudit({
    companyId: v.companyId,
    action: "UPDATE",
    entity: "extrato_mensal",
    entityId: atual?.id as string | undefined,
    oldValue: { status: atual?.status ?? "PENDENTE" },
    newValue: { status: v.status, competencia: v.competencia, contaId: v.contaId },
  });
  revalidar(v.companyId);
  return {};
}

/** Fila: confirma em qual conta/mês o arquivo entra. */
export async function confirmarArquivoExtrato(input: { arquivoId: string; contaId: string; competencia: string }): Promise<{ error?: string }> {
  await requirePermissao("extratos.editar");
  const p = z.object({ arquivoId: uuidLike, contaId: uuidLike, competencia }).safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  const db = await createClient();
  const [{ data: arq }, { data: conta }] = await Promise.all([
    db.from("extrato_arquivos").select("id, blob_url, blob_pathname, nome_arquivo, avisos").eq("id", p.data.arquivoId).single(),
    db.from("extrato_contas_bancarias").select("id, company_id").eq("id", p.data.contaId).single(),
  ]);
  if (!arq || !conta) return { error: "Arquivo ou conta não encontrados." };
  // Confirmação humana: tira os avisos que eram só "não sei onde encaixar".
  const avisos = ((arq.avisos as { codigo: string }[] | null) ?? []).filter(
    (a) => !["CONTA_NAO_CADASTRADA", "CONTA_DIFERENTE", "OUTRO_MES", "SEM_PERIODO", "NAO_EXTRATO", "ERRO"].includes(a.codigo),
  );
  await db
    .from("extrato_arquivos")
    .update({ company_id: conta.company_id, conta_id: conta.id, competencia: p.data.competencia, situacao: "IDENTIFICADO", avisos })
    .eq("id", arq.id);
  await marcarRecebido(db, conta.id as string, p.data.competencia, {
    url: arq.blob_url as string,
    pathname: arq.blob_pathname as string,
    nome: arq.nome_arquivo as string,
  });
  revalidar(conta.company_id as string);
  return {};
}

/** Fila: cadastra a conta lida no arquivo na empresa e confirma. */
export async function cadastrarContaDoArquivo(input: { arquivoId: string; companyId: string; competencia: string }): Promise<{ error?: string }> {
  await requirePermissao("extratos.editar");
  const p = z.object({ arquivoId: uuidLike, companyId: uuidLike, competencia }).safeParse(input);
  if (!p.success) return { error: "Dados inválidos." };
  const db = await createClient();
  const { data: arq } = await db.from("extrato_arquivos").select("leitura").eq("id", p.data.arquivoId).single();
  const l = arq?.leitura as Leitura | null;
  if (!l?.conta) return { error: "O arquivo não traz o número da conta." };
  const { data: conta, error } = await db
    .from("extrato_contas_bancarias")
    .insert({
      company_id: p.data.companyId,
      banco: l.banco ?? "Banco",
      codigo_banco: l.codigoBanco,
      agencia: l.agencia ?? "-",
      conta: l.conta,
    })
    .select("id")
    .single();
  if (error || !conta) return { error: "Não foi possível cadastrar a conta." };
  await logAudit({ companyId: p.data.companyId, action: "CREATE", entity: "extrato_conta_bancaria", newValue: { banco: l.banco, agencia: l.agencia, conta: l.conta, origem: "leitura de extrato" } });
  return confirmarArquivoExtrato({ arquivoId: p.data.arquivoId, contaId: conta.id as string, competencia: p.data.competencia });
}

export async function reprocessarArquivoExtrato(arquivoId: string): Promise<{ error?: string; resultado?: ResultadoProcessamento }> {
  await requirePermissao("extratos.editar");
  if (!uuidLike.safeParse(arquivoId).success) return { error: "Dados inválidos." };
  const db = await createClient();
  try {
    const resultado = await processarArquivo(db, arquivoId);
    revalidar(resultado.companyId);
    return { resultado };
  } catch {
    return { error: "A leitura falhou de novo." };
  }
}

export async function descartarArquivoExtrato(arquivoId: string, apagar = false): Promise<{ error?: string }> {
  await requirePermissao("extratos.editar");
  if (!uuidLike.safeParse(arquivoId).success) return { error: "Dados inválidos." };
  const db = await createClient();
  const { data: arq } = await db.from("extrato_arquivos").select("id, company_id, blob_pathname").eq("id", arquivoId).single();
  if (!arq) return { error: "Arquivo não encontrado." };
  if (apagar) {
    // Não apaga o blob se o mês ainda aponta para ele (download antigo).
    const { count } = await db.from("extratos_mensais").select("id", { count: "exact", head: true }).eq("blob_pathname", arq.blob_pathname);
    await db.from("extrato_arquivos").delete().eq("id", arquivoId);
    if (!count) await del(arq.blob_pathname as string).catch(() => {});
  } else {
    await db.from("extrato_arquivos").update({ situacao: "DESCARTADO" }).eq("id", arquivoId);
  }
  revalidar(arq.company_id as string | null);
  return {};
}

export type { StatusMes };
