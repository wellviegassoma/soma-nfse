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

const salvarFolhaSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência inválida."),
  valor: z
    .string()
    .min(1, "Informe o valor da folha.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((v) => !Number.isNaN(v) && v >= 0, "Valor inválido."),
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, competencia, valor } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("folha_mensal")
    .upsert({ company_id: companyId, competencia, valor }, { onConflict: "company_id,competencia" });

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
  atualizarRbt12: z.literal("on").optional(),
  rbt12Competencia: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  rbt12Valor: z.coerce.number().optional(),
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
    atualizarRbt12: formData.get("atualizarRbt12") || undefined,
    rbt12Competencia: formData.get("rbt12Competencia") || undefined,
    rbt12Valor: formData.get("rbt12Valor") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, linhas, atualizarRbt12, rbt12Competencia, rbt12Valor } = parsed.data;
  if (linhas.length === 0) return { error: "Nenhum mês pra salvar." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("folha_mensal")
    .upsert(
      linhas.map((l) => ({ company_id: companyId, competencia: l.competencia, valor: l.valor })),
      { onConflict: "company_id,competencia" },
    );
  if (error) return { error: "Não foi possível salvar a folha importada." };

  if (atualizarRbt12 === "on" && rbt12Competencia && rbt12Valor != null) {
    await supabase
      .from("companies")
      .update({ rbt12_manual: rbt12Valor, rbt12_manual_competencia: rbt12Competencia })
      .eq("id", companyId);
  }

  revalidatePath(`/admin/empresas/${companyId}/fator-r`);
  revalidatePath(`/admin/empresas/${companyId}/impostos`);
  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  return { success: true, salvos: linhas.length };
}
