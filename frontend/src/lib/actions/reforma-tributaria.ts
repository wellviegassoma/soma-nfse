"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { CAMPOS_ENTRADA_SALVOS } from "@/lib/reforma-tributaria/analise";

const CAMINHO = "/admin/reforma-tributaria";

export type ReformaAcaoState = { error?: string; ok?: string } | undefined;

const status = z.enum(["PENDENTE", "SEM_MUDANCA", "COM_MUDANCA"]);
const dinheiro = z.number().finite().min(0).max(1e10);
const fracao = z.number().finite().min(0).max(1);

const entradaSchema = z
  .object({
    receitaAnual: dinheiro,
    receitaHospitalarAnual: dinheiro,
    salariosAnual: dinheiro,
    proLaboreAnual: dinheiro,
    fgtsAnual: dinheiro,
    sujeitoFatorR: z.boolean(),
    aliquotaIss: fracao,
    reducaoCbsIbs: fracao,
    custosCreditaveisPct: fracao,
    percentualB2b: fracao,
  })
  .partial();

const analiseSchema = z.object({
  companyId: uuidLike,
  status,
  observacao: z.string().trim().max(4000).nullable(),
  temLivroCaixa: z.boolean(),
  livroCaixaMediaMensal: dinheiro.nullable(),
  livroCaixaMeses: z.record(z.string().regex(/^\d{4}-\d{2}$/), dinheiro),
  entrada: entradaSchema,
  regimeRecomendado: z.string().max(40).nullable(),
  anoReferencia: z.number().int().min(2026).max(2033).nullable(),
});

export type SalvarAnaliseInput = z.infer<typeof analiseSchema>;

const msgErroTabela = (e: { message?: string; code?: string }) =>
  e.code === "42P01" || /reforma_analises/.test(e.message ?? "")
    ? "A tabela de análises ainda não existe no banco — aplique a migration fase_bt_reforma_analises."
    : `Não foi possível salvar: ${e.message ?? "erro desconhecido"}`;

/** Salva a análise completa do simulador individual (dados editados + livro caixa + status). */
export async function salvarAnaliseReforma(input: SalvarAnaliseInput): Promise<ReformaAcaoState> {
  await requireSomaStaff();
  const user = await requireUser();
  const p = analiseSchema.safeParse(input);
  if (!p.success) return { error: "Dados inválidos na análise." };
  const d = p.data;

  // Só guarda os campos editáveis conhecidos.
  const entrada: Record<string, unknown> = {};
  for (const campo of CAMPOS_ENTRADA_SALVOS) {
    if (d.entrada[campo] !== undefined) entrada[campo] = d.entrada[campo];
  }
  const meses = Object.fromEntries(Object.entries(d.livroCaixaMeses).filter(([, v]) => v > 0));

  const supabase = await createClient();
  const linha = {
    company_id: d.companyId,
    status: d.status,
    observacao: d.observacao || null,
    tem_livro_caixa: d.temLivroCaixa,
    livro_caixa_media_mensal: d.temLivroCaixa ? d.livroCaixaMediaMensal : null,
    livro_caixa_meses: d.temLivroCaixa ? meses : {},
    entrada,
    regime_recomendado: d.regimeRecomendado,
    ano_referencia: d.anoReferencia,
    analisado_por: user.id,
    analisado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("reforma_analises").upsert(linha, { onConflict: "company_id" });
  if (error) return { error: msgErroTabela(error) };

  await logAudit({
    companyId: d.companyId,
    action: "reforma.analise_salva",
    entity: "reforma_analises",
    entityId: d.companyId,
    newValue: linha,
  });
  revalidatePath(CAMINHO);
  revalidatePath(`${CAMINHO}/${d.companyId}`);
  return { ok: "Análise salva." };
}

/** Apaga a análise salva: a empresa volta a usar só os dados do sistema. */
export async function descartarAnaliseReforma(companyId: string): Promise<ReformaAcaoState> {
  await requireSomaStaff();
  const p = uuidLike.safeParse(companyId);
  if (!p.success) return { error: "Empresa inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("reforma_analises").delete().eq("company_id", p.data);
  if (error) return { error: msgErroTabela(error) };
  await logAudit({ companyId: p.data, action: "reforma.analise_descartada", entity: "reforma_analises", entityId: p.data });
  revalidatePath(CAMINHO);
  revalidatePath(`${CAMINHO}/${p.data}`);
  return { ok: "Análise descartada." };
}

/** Só o status (seletor da coluna Análise na carteira). */
export async function marcarStatusReforma(companyId: string, novo: string): Promise<ReformaAcaoState> {
  await requireSomaStaff();
  const user = await requireUser();
  const p = z.object({ companyId: uuidLike, status }).safeParse({ companyId, status: novo });
  if (!p.success) return { error: "Status inválido." };

  const supabase = await createClient();
  const { error } = await supabase.from("reforma_analises").upsert(
    {
      company_id: p.data.companyId,
      status: p.data.status,
      analisado_por: user.id,
      analisado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );
  if (error) return { error: msgErroTabela(error) };

  await logAudit({
    companyId: p.data.companyId,
    action: "reforma.status",
    entity: "reforma_analises",
    entityId: p.data.companyId,
    newValue: { status: p.data.status },
  });
  revalidatePath(CAMINHO);
  return { ok: "Status salvo." };
}
