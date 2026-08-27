"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireExtratosAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type ExtratosActionState = { error?: string; success?: boolean } | undefined;

const contaBancariaSchema = z.object({
  companyId: uuidLike,
  banco: z.string().trim().min(1, "Informe o banco."),
  agencia: z.string().trim().min(1, "Informe a agência."),
  conta: z.string().trim().min(1, "Informe a conta."),
});

export async function criarContaBancaria(
  _prevState: ExtratosActionState,
  formData: FormData,
): Promise<ExtratosActionState> {
  await requireExtratosAccess();

  const parsed = contaBancariaSchema.safeParse({
    companyId: formData.get("companyId"),
    banco: formData.get("banco"),
    agencia: formData.get("agencia"),
    conta: formData.get("conta"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, banco, agencia, conta } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("extrato_contas_bancarias")
    .insert({ company_id: companyId, banco, agencia, conta });
  if (error) return { error: "Não foi possível cadastrar a conta." };

  await logAudit({ companyId, action: "CREATE", entity: "extrato_conta_bancaria", newValue: { banco, agencia, conta } });
  revalidatePath(`/extratos/empresas/${companyId}`);
  revalidatePath("/extratos");
  return { success: true };
}

export async function apagarContaBancaria(contaId: string, companyId: string) {
  await requireExtratosAccess();
  const supabase = await createClient();

  // Apaga em cascata os extratos_mensais dessa conta (on delete cascade) —
  // inclusive os blobs deles, senão ficam órfãos no Blob.
  const { data: extratos } = await supabase
    .from("extratos_mensais")
    .select("blob_pathname")
    .eq("conta_id", contaId)
    .not("blob_pathname", "is", null);

  await supabase.from("extrato_contas_bancarias").delete().eq("id", contaId);

  const pathnames = (extratos ?? [])
    .map((e) => e.blob_pathname)
    .filter((p): p is string => p != null);
  if (pathnames.length > 0) {
    await del(pathnames).catch(() => {});
  }

  await logAudit({ companyId, action: "DELETE", entity: "extrato_conta_bancaria", entityId: contaId });
  revalidatePath(`/extratos/empresas/${companyId}`);
  revalidatePath("/extratos");
}

const salvarExtratoSchema = z.object({
  companyId: uuidLike,
  contaId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  entregue: z.literal("on").optional(),
  blobUrl: z.string().url().optional(),
  blobPathname: z.string().min(1).optional(),
  nomeArquivo: z.string().min(1).optional(),
});

export async function salvarExtratoMensal(
  _prevState: ExtratosActionState,
  formData: FormData,
): Promise<ExtratosActionState> {
  await requireExtratosAccess();

  const parsed = salvarExtratoSchema.safeParse({
    companyId: formData.get("companyId"),
    contaId: formData.get("contaId"),
    competencia: formData.get("competencia"),
    entregue: formData.get("entregue") || undefined,
    blobUrl: formData.get("blobUrl") || undefined,
    blobPathname: formData.get("blobPathname") || undefined,
    nomeArquivo: formData.get("nomeArquivo") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, contaId, competencia, entregue, blobUrl, blobPathname, nomeArquivo } = parsed.data;

  const supabase = await createClient();

  // Upload de arquivo é opcional (dá pra só marcar "entregue" sem anexar
  // ainda) — busca o que já existia antes de upsertar, pra não apagar um
  // arquivo já enviado só porque essa submissão não trouxe um novo.
  const { data: existente } = await supabase
    .from("extratos_mensais")
    .select("blob_pathname")
    .eq("conta_id", contaId)
    .eq("competencia", competencia)
    .maybeSingle();

  // Campos de arquivo só entram no upsert quando um novo foi enviado —
  // omitidos, o upsert não mexe no que já estava salvo (só atualiza as
  // colunas presentes no payload em caso de conflito).
  const linha: {
    conta_id: string;
    competencia: string;
    entregue: boolean;
    blob_url?: string;
    blob_pathname?: string;
    nome_arquivo?: string;
  } = { conta_id: contaId, competencia, entregue: entregue === "on" };
  if (blobUrl && blobPathname && nomeArquivo) {
    linha.blob_url = blobUrl;
    linha.blob_pathname = blobPathname;
    linha.nome_arquivo = nomeArquivo;
  }

  const { error } = await supabase
    .from("extratos_mensais")
    .upsert(linha, { onConflict: "conta_id,competencia" });
  if (error) return { error: "Não foi possível salvar o extrato do mês." };

  if (existente?.blob_pathname && blobPathname && existente.blob_pathname !== blobPathname) {
    await del(existente.blob_pathname).catch(() => {});
  }

  revalidatePath(`/extratos/empresas/${companyId}`);
  revalidatePath("/extratos");
  return { success: true };
}

export async function apagarExtratoMensal(extratoId: string, companyId: string) {
  await requireExtratosAccess();
  const supabase = await createClient();

  const { data: extrato } = await supabase
    .from("extratos_mensais")
    .select("blob_pathname")
    .eq("id", extratoId)
    .maybeSingle();

  await supabase.from("extratos_mensais").delete().eq("id", extratoId);

  if (extrato?.blob_pathname) {
    await del(extrato.blob_pathname).catch(() => {});
  }

  revalidatePath(`/extratos/empresas/${companyId}`);
  revalidatePath("/extratos");
}
