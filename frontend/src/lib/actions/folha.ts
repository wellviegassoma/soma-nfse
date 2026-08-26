"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { parsePgdasd, type PgdasdImportado } from "@/lib/pdf-import/pgdasd";
import { parseFolhaAnalitica, type FolhaAnaliticaImportada } from "@/lib/pdf-import/folha-analitica";

async function extrairTextoPdf(arquivo: File): Promise<string> {
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  const resultado = await parser.getText();
  return resultado.text;
}

const percentualOuNumeroOpcional = (mensagem: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined))
    .refine((v) => v === undefined || (!Number.isNaN(v) && v >= 0), mensagem);

const salvarFolhaSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  valor: z
    .string()
    .min(1, "Informe o valor da folha.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => !Number.isNaN(v) && v >= 0, "Valor inválido."),
  proLabore: percentualOuNumeroOpcional("Pró-labore inválido."),
  fgts: percentualOuNumeroOpcional("FGTS inválido."),
});

export type SalvarFolhaState = { error?: string; success?: boolean } | undefined;

export async function salvarFolhaMensal(
  _prevState: SalvarFolhaState,
  formData: FormData,
): Promise<SalvarFolhaState> {
  await requireSomaStaff();

  const parsed = salvarFolhaSchema.safeParse({
    companyId: formData.get("companyId"),
    competencia: formData.get("competencia"),
    valor: formData.get("valor"),
    proLabore: formData.get("proLabore") || undefined,
    fgts: formData.get("fgts") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, competencia, valor, proLabore, fgts } = parsed.data;

  // pro_labore/fgts só entram no upsert quando informados no formulário
  // — omitidos (form da tabela mensal não manda os três sempre
  // preenchidos), não mexe no que já estava salvo pra esse mês.
  const linha: {
    company_id: string;
    competencia: string;
    valor: number;
    pro_labore?: number;
    fgts?: number;
  } = { company_id: companyId, competencia, valor };
  if (proLabore !== undefined) linha.pro_labore = proLabore;
  if (fgts !== undefined) linha.fgts = fgts;

  const supabase = await createClient();
  const { error } = await supabase
    .from("folha_mensal")
    .upsert(linha, { onConflict: "company_id,competencia" });

  if (error) return { error: "Não foi possível salvar a folha do mês." };

  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  return { success: true };
}

export type ImportarPgdasdState = { error?: string; resultado?: PgdasdImportado } | undefined;

export async function importarPgdasd(
  _prevState: ImportarPgdasdState,
  formData: FormData,
): Promise<ImportarPgdasdState> {
  await requireSomaStaff();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione o PDF do PGDAS-D." };
  }

  let texto: string;
  try {
    texto = await extrairTextoPdf(arquivo);
  } catch {
    return { error: "Não foi possível ler esse PDF." };
  }

  const resultado = parsePgdasd(texto);
  if (!resultado) {
    return { error: "Não reconheci esse arquivo como uma declaração PGDAS-D." };
  }
  if (resultado.folhaMensal.length === 0) {
    return { error: "Não encontrei a seção de folha de salários anteriores nesse PDF." };
  }
  return { resultado };
}

export type ImportarFolhaAnaliticaState =
  | { error?: string; resultado?: FolhaAnaliticaImportada }
  | undefined;

export async function importarFolhaAnalitica(
  _prevState: ImportarFolhaAnaliticaState,
  formData: FormData,
): Promise<ImportarFolhaAnaliticaState> {
  await requireSomaStaff();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione o PDF da folha de pagamento." };
  }

  let texto: string;
  try {
    texto = await extrairTextoPdf(arquivo);
  } catch {
    return { error: "Não foi possível ler esse PDF." };
  }

  const resultado = parseFolhaAnalitica(texto);
  if (!resultado) {
    return { error: "Não reconheci esse arquivo como uma folha de pagamento." };
  }
  return { resultado };
}

const salvarFolhaAnaliticaSchema = z.object({
  companyId: uuidLike,
  competenciaProLabore: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  competenciaSalariosFgts: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  proLabore: z.coerce.number().min(0),
  salarios: z.coerce.number().min(0),
  fgts: z.coerce.number().min(0),
});

export type SalvarFolhaAnaliticaState = { error?: string; success?: boolean } | undefined;

// Pró-labore entra na competência da própria folha; salários e FGTS só
// são efetivamente pagos/recolhidos no mês seguinte, então vão pra
// competência seguinte — duas linhas de folha_mensal por importação.
export async function salvarFolhaAnaliticaImportada(
  _prevState: SalvarFolhaAnaliticaState,
  formData: FormData,
): Promise<SalvarFolhaAnaliticaState> {
  await requireSomaStaff();

  const parsed = salvarFolhaAnaliticaSchema.safeParse({
    companyId: formData.get("companyId"),
    competenciaProLabore: formData.get("competenciaProLabore"),
    competenciaSalariosFgts: formData.get("competenciaSalariosFgts"),
    proLabore: formData.get("proLabore"),
    salarios: formData.get("salarios"),
    fgts: formData.get("fgts"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, competenciaProLabore, competenciaSalariosFgts, proLabore, salarios, fgts } =
    parsed.data;

  const supabase = await createClient();

  // Duas competências diferentes, cada uma podendo já ter uma linha
  // salva (vinda de outra importação) — busca o que já existe em cada
  // uma antes de upsertar, pra só sobrescrever o campo da vez sem
  // apagar os outros dois.
  const { data: linhaProLabore } = await supabase
    .from("folha_mensal")
    .select("valor, fgts")
    .eq("company_id", companyId)
    .eq("competencia", competenciaProLabore)
    .maybeSingle();

  const { error: erroProLabore } = await supabase.from("folha_mensal").upsert(
    {
      company_id: companyId,
      competencia: competenciaProLabore,
      valor: linhaProLabore?.valor ?? 0,
      fgts: linhaProLabore?.fgts ?? null,
      pro_labore: proLabore,
    },
    { onConflict: "company_id,competencia" },
  );
  if (erroProLabore) return { error: "Não foi possível salvar o pró-labore." };

  const { data: linhaSalariosFgts } = await supabase
    .from("folha_mensal")
    .select("pro_labore")
    .eq("company_id", companyId)
    .eq("competencia", competenciaSalariosFgts)
    .maybeSingle();

  const { error: erroSalariosFgts } = await supabase.from("folha_mensal").upsert(
    {
      company_id: companyId,
      competencia: competenciaSalariosFgts,
      valor: salarios,
      fgts,
      pro_labore: linhaSalariosFgts?.pro_labore ?? null,
    },
    { onConflict: "company_id,competencia" },
  );
  if (erroSalariosFgts) return { error: "Não foi possível salvar salários/FGTS." };

  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  return { success: true };
}

const linhaFolhaLoteSchema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  valor: z.number().min(0),
});

const salvarFolhaLoteSchema = z.object({
  companyId: uuidLike,
  linhas: z.string().transform((v, ctx) => {
    try {
      return z.array(linhaFolhaLoteSchema).parse(JSON.parse(v));
    } catch {
      ctx.addIssue({ code: "custom", message: "Dados inválidos." });
      return z.NEVER;
    }
  }),
});

export type SalvarFolhaLoteState = { error?: string; success?: boolean; salvos?: number } | undefined;

export async function salvarFolhaMensalLote(
  _prevState: SalvarFolhaLoteState,
  formData: FormData,
): Promise<SalvarFolhaLoteState> {
  await requireSomaStaff();

  const parsed = salvarFolhaLoteSchema.safeParse({
    companyId: formData.get("companyId"),
    linhas: formData.get("linhas"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, linhas } = parsed.data;
  if (linhas.length === 0) return { error: "Nenhum mês pra salvar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("folha_mensal")
    .upsert(
      linhas.map((l) => ({ company_id: companyId, competencia: l.competencia, valor: l.valor })),
      { onConflict: "company_id,competencia" },
    );
  if (error) return { error: "Não foi possível salvar a folha importada." };

  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  return { success: true, salvos: linhas.length };
}
