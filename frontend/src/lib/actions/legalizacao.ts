"use server";

import { revalidatePath } from "next/cache";
import { del, get } from "@vercel/blob";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireLegalizacaoAccess, requirePermissao, requireUser } from "@/lib/auth";
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
    numero: z.string().trim().max(120).optional(),
    orgao: z.string().trim().max(200).optional(),
    dataEmissao: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Data de emissão inválida.")
      .optional(),
    // Sem arquivo novo = só corrige os dados da licença vigente.
    blobUrl: z.string().url().optional(),
    blobPathname: z.string().min(1).optional(),
    nomeArquivo: z.string().min(1).optional(),
  })
  .refine((v) => v.indeterminado === "on" || v.dataVencimento, {
    message: "Informe a data de vencimento ou marque validade indeterminada.",
    path: ["dataVencimento"],
  })
  .refine((v) => !v.dataEmissao || !v.dataVencimento || v.dataVencimento >= v.dataEmissao, {
    message: "O vencimento não pode ser antes da emissão.",
    path: ["dataVencimento"],
  });

// O upload em si já aconteceu no cliente, direto pro Vercel Blob (ver
// /api/legalizacao/upload) — essa action só grava a referência depois que o
// arquivo já está lá. Se já existia uma licença desse tipo pra essa empresa
// e veio arquivo novo, a anterior vai pro histórico (com o arquivo, que
// continua no Blob) — é a renovação. Sem arquivo novo, só atualiza os dados
// (número, órgão, datas) da licença vigente.
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
    numero: formData.get("numero") || undefined,
    orgao: formData.get("orgao") || undefined,
    dataEmissao: formData.get("dataEmissao") || undefined,
    blobUrl: formData.get("blobUrl") || undefined,
    blobPathname: formData.get("blobPathname") || undefined,
    nomeArquivo: formData.get("nomeArquivo") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, tipoId, indeterminado, blobUrl, blobPathname, nomeArquivo } = parsed.data;
  const dataVencimento = indeterminado === "on" ? null : (parsed.data.dataVencimento ?? null);
  const dados = {
    numero: parsed.data.numero || null,
    orgao: parsed.data.orgao || null,
    data_emissao: parsed.data.dataEmissao || null,
    data_vencimento: dataVencimento,
  };

  const user = await requireUser();
  const supabase = await createClient();

  const { data: existente } = await supabase
    .from("legalizacao_documentos")
    .select(
      "id, numero, orgao, data_emissao, data_vencimento, blob_url, blob_pathname, nome_arquivo, uploaded_by, created_at, updated_at",
    )
    .eq("company_id", companyId)
    .eq("tipo_id", tipoId)
    .maybeSingle();

  const arquivoNovo = blobUrl && blobPathname && nomeArquivo ? { blobUrl, blobPathname, nomeArquivo } : null;

  if (!arquivoNovo) {
    if (!existente) return { error: "Selecione o arquivo do documento." };
    const { error } = await supabase.from("legalizacao_documentos").update(dados).eq("id", existente.id);
    if (error) return { error: "Não foi possível salvar os dados da licença." };
    await logAudit({
      companyId,
      action: "UPDATE",
      entity: "legalizacao_documento",
      entityId: existente.id,
      oldValue: {
        numero: existente.numero,
        orgao: existente.orgao,
        data_emissao: existente.data_emissao,
        data_vencimento: existente.data_vencimento,
      },
      newValue: dados,
    });
  } else {
    if (existente && existente.blob_pathname !== arquivoNovo.blobPathname) {
      const { error: errHist } = await supabase.from("legalizacao_documentos_historico").insert({
        company_id: companyId,
        tipo_id: tipoId,
        numero: existente.numero,
        orgao: existente.orgao,
        data_emissao: existente.data_emissao,
        data_vencimento: existente.data_vencimento,
        blob_url: existente.blob_url,
        blob_pathname: existente.blob_pathname,
        nome_arquivo: existente.nome_arquivo,
        uploaded_by: existente.uploaded_by,
        enviado_em: existente.updated_at ?? existente.created_at,
        substituido_por: user.id,
      });
      if (errHist) return { error: "Não foi possível guardar a licença anterior no histórico." };
    }

    const { error } = await supabase.from("legalizacao_documentos").upsert(
      {
        company_id: companyId,
        tipo_id: tipoId,
        ...dados,
        blob_url: arquivoNovo.blobUrl,
        blob_pathname: arquivoNovo.blobPathname,
        nome_arquivo: arquivoNovo.nomeArquivo,
        uploaded_by: user.id,
      },
      { onConflict: "company_id,tipo_id" },
    );
    if (error) return { error: "Não foi possível salvar o documento." };

    await logAudit({
      companyId,
      action: "UPLOAD",
      entity: "legalizacao_documento",
      newValue: { tipo_id: tipoId, ...dados, nome_arquivo: arquivoNovo.nomeArquivo },
    });
  }

  revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath(`/legalizacao/empresas/${companyId}/gerenciar`);
  revalidatePath("/legalizacao");
  revalidatePath("/legalizacao/licencas");
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

const salvarRegraSchema = z
  .object({
    tipoId: uuidLike,
    municipalityIbgeCode: z.string().regex(/^\d{7}$/).optional(),
    municipalityName: z.string().trim().optional(),
    state: z.string().trim().optional(),
    modo: z.enum(["DATA_FIXA", "MESES_APOS_EMISSAO", "INDETERMINADO"]),
    dia: z.coerce.number().int().min(1).max(31).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    meses: z.coerce.number().int().min(1).max(120).optional(),
    antecedenciaDias: z.coerce.number().int().min(0, "Antecedência inválida.").max(365, "Antecedência máxima: 365 dias."),
    observacao: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.modo !== "DATA_FIXA" || (v.dia && v.mes), { message: "Informe o dia e o mês do vencimento.", path: ["dia"] })
  .refine((v) => v.modo !== "MESES_APOS_EMISSAO" || v.meses, { message: "Informe quantos meses após a emissão.", path: ["meses"] });

// Cria ou substitui a regra de vencimento de um tipo num município (ou a
// regra padrão do tipo, sem município). Uma regra por tipo+município.
export async function salvarRegraVencimento(
  _prevState: LegalizacaoActionState,
  formData: FormData,
): Promise<LegalizacaoActionState> {
  await requirePermissao("legalizacao.editar");

  const parsed = salvarRegraSchema.safeParse({
    tipoId: formData.get("tipoId"),
    municipalityIbgeCode: formData.get("municipalityIbgeCode") || undefined,
    municipalityName: formData.get("municipalityName") || undefined,
    state: formData.get("state") || undefined,
    modo: formData.get("modo"),
    dia: formData.get("dia") || undefined,
    mes: formData.get("mes") || undefined,
    meses: formData.get("meses") || undefined,
    antecedenciaDias: formData.get("antecedenciaDias") || 60,
    observacao: formData.get("observacao") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const linha = {
    tipo_id: v.tipoId,
    municipality_ibge_code: v.municipalityIbgeCode ?? null,
    municipality_name: v.municipalityIbgeCode ? (v.municipalityName ?? null) : null,
    state: v.municipalityIbgeCode ? (v.state ?? null) : null,
    modo: v.modo,
    dia: v.modo === "DATA_FIXA" ? v.dia! : null,
    mes: v.modo === "DATA_FIXA" ? v.mes! : null,
    meses: v.modo === "MESES_APOS_EMISSAO" ? v.meses! : null,
    antecedencia_dias: v.antecedenciaDias,
    observacao: v.observacao || null,
  };

  const supabase = await createClient();
  let busca = supabase.from("legalizacao_regras_vencimento").select("id").eq("tipo_id", v.tipoId);
  busca = linha.municipality_ibge_code
    ? busca.eq("municipality_ibge_code", linha.municipality_ibge_code)
    : busca.is("municipality_ibge_code", null);
  const { data: existente } = await busca.maybeSingle();

  const { error } = existente
    ? await supabase.from("legalizacao_regras_vencimento").update(linha).eq("id", existente.id)
    : await supabase.from("legalizacao_regras_vencimento").insert(linha);
  if (error) return { error: "Não foi possível salvar a regra." };

  await logAudit({ action: existente ? "UPDATE" : "CREATE", entity: "legalizacao_regra_vencimento", newValue: linha });
  revalidatePath("/legalizacao/regras");
  revalidatePath("/legalizacao/licencas");
  return { success: true };
}

export async function apagarRegraVencimento(regraId: string) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  await supabase.from("legalizacao_regras_vencimento").delete().eq("id", regraId);
  await logAudit({ action: "DELETE", entity: "legalizacao_regra_vencimento", entityId: regraId });
  revalidatePath("/legalizacao/regras");
  revalidatePath("/legalizacao/licencas");
}
