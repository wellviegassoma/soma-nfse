"use server";

import { revalidatePath } from "next/cache";
import { del, get } from "@vercel/blob";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLegalizacaoAccess, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { analisarTextoDocumento } from "@/lib/pdf-import/legalizacao-analise";

export type LegalizacaoActionState =
  | { error?: string; success?: boolean; tipoId?: string }
  | undefined;

const salvarDocumentoSchema = z
  .object({
    companyId: uuidLike,
    tipoId: uuidLike,
    dataVencimento: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
      .optional(),
    indeterminado: z.literal("on").optional(),
    blobUrl: z.string().url(),
    blobPathname: z.string().min(1),
    nomeArquivo: z.string().min(1),
  })
  .refine((v) => v.indeterminado === "on" || v.dataVencimento, {
    message: "Informe a data de vencimento ou marque validade indeterminada.",
    path: ["dataVencimento"],
  });

// O upload em si já aconteceu no cliente, direto pro Vercel Blob (ver
// /api/legalizacao/upload) — essa action só grava a referência depois que o
// arquivo já está lá. Se já existia um documento desse tipo pra essa
// empresa, apaga o blob antigo do Blob (senão fica órfão, ocupando espaço
// sem nenhuma linha apontando pra ele).
export async function salvarDocumentoLegalizacao(
  _prevState: LegalizacaoActionState,
  formData: FormData,
): Promise<LegalizacaoActionState> {
  await requireLegalizacaoAccess();

  const parsed = salvarDocumentoSchema.safeParse({
    companyId: formData.get("companyId"),
    tipoId: formData.get("tipoId"),
    dataVencimento: formData.get("dataVencimento") || undefined,
    indeterminado: formData.get("indeterminado") || undefined,
    blobUrl: formData.get("blobUrl"),
    blobPathname: formData.get("blobPathname"),
    nomeArquivo: formData.get("nomeArquivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, tipoId, indeterminado, blobUrl, blobPathname, nomeArquivo } = parsed.data;
  const dataVencimento = indeterminado === "on" ? null : (parsed.data.dataVencimento ?? null);

  const user = await requireUser();
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("legalizacao_documentos")
    .select("blob_pathname")
    .eq("company_id", companyId)
    .eq("tipo_id", tipoId)
    .maybeSingle();

  const { error } = await supabase.from("legalizacao_documentos").upsert(
    {
      company_id: companyId,
      tipo_id: tipoId,
      data_vencimento: dataVencimento,
      blob_url: blobUrl,
      blob_pathname: blobPathname,
      nome_arquivo: nomeArquivo,
      uploaded_by: user.id,
    },
    { onConflict: "company_id,tipo_id" },
  );
  if (error) return { error: "Não foi possível salvar o documento." };

  if (existente && existente.blob_pathname !== blobPathname) {
    await del(existente.blob_pathname).catch(() => {});
  }

  await logAudit({
    companyId,
    action: "UPLOAD",
    entity: "legalizacao_documento",
    newValue: { tipo_id: tipoId, data_vencimento: dataVencimento, nome_arquivo: nomeArquivo },
  });

  revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath("/legalizacao");
  return { success: true };
}

// Limpa um upload feito mas nunca salvo — o arquivo já vai pro Blob assim
// que selecionado (pra poder analisar antes de confirmar), então se o
// usuário troca de arquivo ou desiste antes de clicar Salvar, o upload
// anterior ficaria órfão no Blob (sem nenhuma linha no banco apontando pra
// ele) se ninguém apagasse.
export async function apagarBlobOrfao(pathname: string) {
  await requireLegalizacaoAccess();
  if (!pathname.startsWith("legalizacao/")) return;
  await del(pathname).catch(() => {});
}

export type AnaliseDocumentoResult = {
  dataVencimentoSugerida: string | null;
  cnpjEncontrado: string | null;
  cnpjConfere: boolean | null; // null = não deu pra conferir (nenhum CNPJ encontrado no documento)
};

// Lê o texto do PDF já enviado ao Blob e tenta achar a validade e o CNPJ
// dentro do documento — é uma sugestão por aproximação de texto (nenhum
// formato fixo, cada município tem o seu), não uma extração garantida.
// Documento escaneado/foto sem camada de texto simplesmente não retorna
// nada (sem erro) — nesse caso o usuário preenche manualmente como já
// fazia antes dessa função existir.
export async function analisarDocumentoLegalizacao(
  blobPathname: string,
  companyId: string,
): Promise<AnaliseDocumentoResult> {
  await requireLegalizacaoAccess();

  const vazio: AnaliseDocumentoResult = {
    dataVencimentoSugerida: null,
    cnpjEncontrado: null,
    cnpjConfere: null,
  };

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .maybeSingle();

  let texto: string;
  try {
    const blob = await get(blobPathname, { access: "private" });
    if (!blob || blob.statusCode !== 200 || !blob.blob.contentType.includes("pdf")) return vazio;
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    texto = (await parser.getText()).text;
  } catch {
    return vazio;
  }

  const { dataVencimentoSugerida, cnpjEncontrado } = analisarTextoDocumento(texto);
  const cnpjEmpresa = company?.cnpj?.replace(/\D/g, "") || null;
  const cnpjConfere =
    cnpjEncontrado && cnpjEmpresa ? cnpjEncontrado === cnpjEmpresa : null;

  return { dataVencimentoSugerida, cnpjEncontrado, cnpjConfere };
}

export async function apagarDocumentoLegalizacao(documentoId: string, companyId: string) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("legalizacao_documentos")
    .select("blob_pathname")
    .eq("id", documentoId)
    .maybeSingle();

  const { error } = await supabase.from("legalizacao_documentos").delete().eq("id", documentoId);
  if (error) return;

  if (doc?.blob_pathname) {
    await del(doc.blob_pathname).catch(() => {});
  }

  await logAudit({ companyId, action: "DELETE", entity: "legalizacao_documento", entityId: documentoId });
  revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath("/legalizacao");
}

const criarTipoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do tipo de documento."),
  aplicaATodas: z.literal("on").optional(),
});

export async function criarTipoDocumento(
  _prevState: LegalizacaoActionState,
  formData: FormData,
): Promise<LegalizacaoActionState> {
  await requireLegalizacaoAccess();

  const parsed = criarTipoSchema.safeParse({
    nome: formData.get("nome"),
    aplicaATodas: formData.get("aplicaATodas") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("legalizacao_tipos_documento")
    .insert({ nome: parsed.data.nome, aplica_a_todas: parsed.data.aplicaATodas === "on" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Já existe um tipo de documento com esse nome." };
    return { error: "Não foi possível criar o tipo de documento." };
  }

  revalidatePath("/legalizacao/tipos");
  revalidatePath("/legalizacao");
  return { success: true, tipoId: data.id };
}

export async function alternarAtivoTipoDocumento(tipoId: string, ativo: boolean) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();
  await supabase.from("legalizacao_tipos_documento").update({ ativo }).eq("id", tipoId);
  revalidatePath("/legalizacao/tipos");
  revalidatePath("/legalizacao");
}

// Muda o padrão do tipo: aplicável a todas as empresas por padrão, ou só
// às empresas explicitamente selecionadas na tela de gerenciamento. Não
// mexe nas exceções já cadastradas — elas continuam valendo como exceção
// ao novo padrão.
export async function alternarModoAplicacaoTipo(tipoId: string, aplicaATodas: boolean) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();
  await supabase.from("legalizacao_tipos_documento").update({ aplica_a_todas: aplicaATodas }).eq("id", tipoId);
  revalidatePath("/legalizacao/tipos");
  revalidatePath("/legalizacao");
}

// Ausência de linha em legalizacao_tipos_empresas_excecao = a empresa usa
// o padrão do tipo (aplica_a_todas). Uma linha aqui é a exceção pontual
// pra essa empresa, nos dois sentidos: exclui (tipo aplica a todas, mas
// essa empresa não precisa) ou inclui (tipo é restrito, mas essa empresa
// precisa).
export async function alternarTipoAplicavel(companyId: string, tipoId: string, aplicavel: boolean) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();
  const { data: tipo } = await supabase
    .from("legalizacao_tipos_documento")
    .select("aplica_a_todas")
    .eq("id", tipoId)
    .single();
  if (!tipo) return;

  if (aplicavel === tipo.aplica_a_todas) {
    await supabase
      .from("legalizacao_tipos_empresas_excecao")
      .delete()
      .eq("company_id", companyId)
      .eq("tipo_id", tipoId);
  } else {
    await supabase
      .from("legalizacao_tipos_empresas_excecao")
      .upsert({ company_id: companyId, tipo_id: tipoId, aplicavel }, { onConflict: "company_id,tipo_id" });
  }
  revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath(`/legalizacao/empresas/${companyId}/gerenciar`);
  revalidatePath("/legalizacao");
}

// Define, de uma vez só, o conjunto completo de empresas em que esse tipo
// é aplicável — usado pela tela "Gerenciar empresas" do tipo, pra não
// precisar entrar empresa por empresa. Recria as exceções do zero,
// guardando só as que realmente divergem do padrão do tipo (mesmo
// princípio de manter a tabela enxuta usado em alternarTipoAplicavel).
export async function definirEmpresasAplicaveisDoTipo(tipoId: string, companyIdsAplicaveis: string[]) {
  await requireLegalizacaoAccess();
  const supabase = await createClient();

  const [{ data: tipo }, { data: empresas }] = await Promise.all([
    supabase.from("legalizacao_tipos_documento").select("aplica_a_todas").eq("id", tipoId).single(),
    supabase.from("companies").select("id"),
  ]);
  if (!tipo) return;

  const aplicaveisSet = new Set(companyIdsAplicaveis);
  const linhas = (empresas ?? [])
    .filter((empresa) => aplicaveisSet.has(empresa.id) !== tipo.aplica_a_todas)
    .map((empresa) => ({
      company_id: empresa.id,
      tipo_id: tipoId,
      aplicavel: aplicaveisSet.has(empresa.id),
    }));

  await supabase.from("legalizacao_tipos_empresas_excecao").delete().eq("tipo_id", tipoId);
  if (linhas.length > 0) {
    await supabase.from("legalizacao_tipos_empresas_excecao").insert(linhas);
  }

  revalidatePath(`/legalizacao/tipos/${tipoId}/empresas`);
  revalidatePath("/legalizacao/tipos");
  revalidatePath("/legalizacao");
}
