"use server";

import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLegalizacaoAccess, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type SocietarioActionState = { error?: string; success?: boolean } | undefined;

function pathBaseFor(companyId: string) {
  return `/legalizacao/empresas/${companyId}/societario`;
}

// --- Documentos societários (contrato social + alterações) ---------------

const salvarDocumentoSocietarioSchema = z.object({
  companyId: uuidLike,
  categoria: z.enum(["contrato_social", "iptu", "outros"]).default("contrato_social"),
  dataDocumento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida."),
  descricao: z.string().trim().min(2, "Descreva o documento."),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  nomeArquivo: z.string().min(1),
});

export async function salvarDocumentoSocietario(
  _prevState: SocietarioActionState,
  formData: FormData,
): Promise<SocietarioActionState> {
  await requireLegalizacaoAccess();

  const parsed = salvarDocumentoSocietarioSchema.safeParse({
    companyId: formData.get("companyId"),
    categoria: formData.get("categoria") || undefined,
    dataDocumento: formData.get("dataDocumento"),
    descricao: formData.get("descricao"),
    blobUrl: formData.get("blobUrl"),
    blobPathname: formData.get("blobPathname"),
    nomeArquivo: formData.get("nomeArquivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, categoria, dataDocumento, descricao, blobUrl, blobPathname, nomeArquivo } = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("societario_documentos").insert({
    company_id: companyId,
    categoria,
    data_documento: dataDocumento,
    descricao,
    blob_url: blobUrl,
    blob_pathname: blobPathname,
    nome_arquivo: nomeArquivo,
    uploaded_by: user.id,
  });
  if (error) return { error: "Não foi possível salvar o documento." };

  await logAudit({
    companyId,
    action: "UPLOAD",
    entity: "societario_documento",
    newValue: { data_documento: dataDocumento, descricao, nome_arquivo: nomeArquivo },
  });

  revalidatePath(pathBaseFor(companyId));
  return { success: true };
}

export async function apagarDocumentoSocietario(documentoId: string, companyId: string) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("societario_documentos")
    .select("blob_pathname")
    .eq("id", documentoId)
    .maybeSingle();

  const { error } = await supabase.from("societario_documentos").delete().eq("id", documentoId);
  if (error) return;

  if (doc?.blob_pathname) await del(doc.blob_pathname).catch(() => {});

  await logAudit({ companyId, action: "DELETE", entity: "societario_documento", entityId: documentoId });
  revalidatePath(pathBaseFor(companyId));
}

// Limpa um upload feito mas nunca salvo (mesmo risco de órfão do módulo
// Legalização, caso algum formulário venha a fazer upload-antes-de-salvar).
export async function apagarBlobOrfaoSocietario(pathname: string) {
  await requireLegalizacaoAccess();
  if (!pathname.startsWith("societario/") && !pathname.startsWith("socios/")) return;
  await del(pathname).catch(() => {});
}

// --- Sócios ----------------------------------------------------------------

const socioSchema = z.object({
  companyId: uuidLike,
  tipoPessoa: z.enum(["PF", "PJ"]),
  nome: z.string().trim().min(2, "Informe o nome ou razão social."),
  documento: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  percentualParticipacao: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined))
    .refine((v) => v === undefined || (v >= 0 && v <= 100), "Percentual precisa estar entre 0 e 100."),
  dataEntrada: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  dataSaida: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export async function criarSocio(
  _prevState: SocietarioActionState,
  formData: FormData,
): Promise<SocietarioActionState> {
  await requireLegalizacaoAccess();

  const parsed = socioSchema.safeParse({
    companyId: formData.get("companyId"),
    tipoPessoa: formData.get("tipoPessoa"),
    nome: formData.get("nome"),
    documento: formData.get("documento") || undefined,
    percentualParticipacao: formData.get("percentualParticipacao") || undefined,
    dataEntrada: formData.get("dataEntrada") || undefined,
    dataSaida: formData.get("dataSaida") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, tipoPessoa, nome, documento, percentualParticipacao, dataEntrada, dataSaida } =
    parsed.data;

  const supabase = await createClient();
  const { data: socio, error } = await supabase
    .from("socios")
    .insert({
      company_id: companyId,
      tipo_pessoa: tipoPessoa,
      nome,
      documento: documento || null,
      percentual_participacao: percentualParticipacao ?? null,
      data_entrada: dataEntrada || null,
      data_saida: dataSaida || null,
    })
    .select("id")
    .single();
  if (error || !socio) return { error: "Não foi possível cadastrar o sócio." };

  await logAudit({ companyId, action: "CREATE", entity: "socio", entityId: socio.id, newValue: { nome, tipoPessoa } });
  revalidatePath(pathBaseFor(companyId));
  return { success: true };
}

const atualizarSocioSchema = socioSchema.extend({ socioId: uuidLike });

export async function atualizarSocio(
  _prevState: SocietarioActionState,
  formData: FormData,
): Promise<SocietarioActionState> {
  await requireLegalizacaoAccess();

  const parsed = atualizarSocioSchema.safeParse({
    socioId: formData.get("socioId"),
    companyId: formData.get("companyId"),
    tipoPessoa: formData.get("tipoPessoa"),
    nome: formData.get("nome"),
    documento: formData.get("documento") || undefined,
    percentualParticipacao: formData.get("percentualParticipacao") || undefined,
    dataEntrada: formData.get("dataEntrada") || undefined,
    dataSaida: formData.get("dataSaida") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { socioId, companyId, tipoPessoa, nome, documento, percentualParticipacao, dataEntrada, dataSaida } =
    parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("socios")
    .update({
      tipo_pessoa: tipoPessoa,
      nome,
      documento: documento || null,
      percentual_participacao: percentualParticipacao ?? null,
      data_entrada: dataEntrada || null,
      data_saida: dataSaida || null,
    })
    .eq("id", socioId);
  if (error) return { error: "Não foi possível salvar as alterações do sócio." };

  await logAudit({ companyId, action: "UPDATE", entity: "socio", entityId: socioId, newValue: { nome, tipoPessoa } });
  revalidatePath(pathBaseFor(companyId));
  return { success: true };
}

export async function apagarSocio(socioId: string, companyId: string) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const { data: documentos } = await supabase
    .from("socios_documentos")
    .select("blob_pathname")
    .eq("socio_id", socioId);

  const { error } = await supabase.from("socios").delete().eq("id", socioId);
  if (error) return;

  await Promise.all((documentos ?? []).map((d) => del(d.blob_pathname).catch(() => {})));

  await logAudit({ companyId, action: "DELETE", entity: "socio", entityId: socioId });
  revalidatePath(pathBaseFor(companyId));
}

// --- Documentos do sócio ----------------------------------------------------

const salvarDocumentoSocioSchema = z.object({
  socioId: uuidLike,
  companyId: uuidLike,
  descricao: z.string().trim().min(2, "Descreva o documento."),
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  nomeArquivo: z.string().min(1),
});

export async function salvarDocumentoSocio(
  _prevState: SocietarioActionState,
  formData: FormData,
): Promise<SocietarioActionState> {
  await requireLegalizacaoAccess();

  const parsed = salvarDocumentoSocioSchema.safeParse({
    socioId: formData.get("socioId"),
    companyId: formData.get("companyId"),
    descricao: formData.get("descricao"),
    blobUrl: formData.get("blobUrl"),
    blobPathname: formData.get("blobPathname"),
    nomeArquivo: formData.get("nomeArquivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { socioId, companyId, descricao, blobUrl, blobPathname, nomeArquivo } = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("socios_documentos").insert({
    socio_id: socioId,
    descricao,
    blob_url: blobUrl,
    blob_pathname: blobPathname,
    nome_arquivo: nomeArquivo,
    uploaded_by: user.id,
  });
  if (error) return { error: "Não foi possível salvar o documento." };

  await logAudit({
    companyId,
    action: "UPLOAD",
    entity: "socio_documento",
    newValue: { socio_id: socioId, descricao, nome_arquivo: nomeArquivo },
  });

  revalidatePath(pathBaseFor(companyId));
  return { success: true };
}

export async function apagarDocumentoSocio(documentoId: string, companyId: string) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("socios_documentos")
    .select("blob_pathname")
    .eq("id", documentoId)
    .maybeSingle();

  const { error } = await supabase.from("socios_documentos").delete().eq("id", documentoId);
  if (error) return;

  if (doc?.blob_pathname) await del(doc.blob_pathname).catch(() => {});

  await logAudit({ companyId, action: "DELETE", entity: "socio_documento", entityId: documentoId });
  revalidatePath(pathBaseFor(companyId));
}
