"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { abrirRenovacaoCore } from "@/lib/legalizacao-renovacao-core";

function revalidarRenovacao(processoId?: string, companyId?: string | null) {
  if (processoId) revalidatePath(`/legalizacao/processos/${processoId}`);
  if (companyId) revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath("/legalizacao/processos");
  revalidatePath("/legalizacao/renovacoes");
  revalidatePath("/legalizacao/licencas");
}

export async function abrirRenovacao(
  companyId: string,
  tipoId: string,
): Promise<{ processoId: string } | { error: string; processoExistenteId?: string }> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  if (!uuidLike.safeParse(companyId).success || !uuidLike.safeParse(tipoId).success) {
    return { error: "Dados inválidos." };
  }
  const supabase = await createClient();
  const resultado = await abrirRenovacaoCore(supabase, {
    companyId,
    tipoId,
    criadoPor: user.id,
    origem: "MANUAL",
    responsavelId: user.id,
  });
  if ("processoId" in resultado) revalidarRenovacao(resultado.processoId, companyId);
  return resultado;
}

const dadosRenovacaoSchema = z.object({
  processoId: uuidLike,
  protocoloNumero: z.string().trim().max(120).optional(),
  protocoloData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guiaValor: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/\./g, "").replace(",", ".")) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Valor da guia inválido."),
  guiaVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type DadosRenovacaoState = { error?: string; success?: boolean } | undefined;

export async function salvarDadosRenovacao(
  _prev: DadosRenovacaoState,
  formData: FormData,
): Promise<DadosRenovacaoState> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const parsed = dadosRenovacaoSchema.safeParse({
    processoId: formData.get("processoId"),
    protocoloNumero: formData.get("protocoloNumero") || undefined,
    protocoloData: formData.get("protocoloData") || undefined,
    guiaValor: formData.get("guiaValor") || undefined,
    guiaVencimento: formData.get("guiaVencimento") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("legalizacao_processos")
    .select("company_id, protocolo_numero, protocolo_data, guia_valor, guia_vencimento")
    .eq("id", v.processoId)
    .single();
  if (!antes) return { error: "Processo não encontrado." };

  const novo = {
    protocolo_numero: v.protocoloNumero || null,
    protocolo_data: v.protocoloData || null,
    guia_valor: v.guiaValor,
    guia_vencimento: v.guiaVencimento || null,
  };
  const { error } = await supabase.from("legalizacao_processos").update(novo).eq("id", v.processoId);
  if (error) return { error: "Não foi possível salvar." };

  const mudancas: string[] = [];
  if ((antes.protocolo_numero ?? null) !== novo.protocolo_numero && novo.protocolo_numero)
    mudancas.push(`protocolo nº ${novo.protocolo_numero}`);
  if ((antes.protocolo_data ?? null) !== novo.protocolo_data && novo.protocolo_data)
    mudancas.push(`protocolado em ${novo.protocolo_data.split("-").reverse().join("/")}`);
  if (Number(antes.guia_valor ?? NaN) !== Number(novo.guia_valor ?? NaN) && novo.guia_valor != null)
    mudancas.push(`guia de R$ ${novo.guia_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  if ((antes.guia_vencimento ?? null) !== novo.guia_vencimento && novo.guia_vencimento)
    mudancas.push(`guia vence em ${novo.guia_vencimento.split("-").reverse().join("/")}`);
  if (mudancas.length > 0) {
    await supabase.from("legalizacao_processo_atividade").insert({
      processo_id: v.processoId,
      tipo: "ALTERACAO_PROCESSO",
      autor_id: user.id,
      corpo: `Registrou ${mudancas.join(", ")}.`,
    });
  }

  revalidarRenovacao(v.processoId, antes.company_id);
  return { success: true };
}

export async function marcarRequisito(requisitoId: string, processoId: string, recebido: boolean) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("legalizacao_processo_requisitos")
    .update(recebido ? { recebido_em: new Date().toISOString(), recebido_por: user.id } : { recebido_em: null, recebido_por: null })
    .eq("id", requisitoId)
    .eq("processo_id", processoId);
  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/renovacoes");
}

export async function adicionarRequisito(processoId: string, item: string) {
  await requirePermissao("legalizacao.editar");
  const texto = item.trim();
  if (texto.length < 2) return;
  const supabase = await createClient();
  await supabase.from("legalizacao_processo_requisitos").insert({ processo_id: processoId, item: texto, ordem: 1000 });
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function removerRequisito(requisitoId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  await supabase.from("legalizacao_processo_requisitos").delete().eq("id", requisitoId).eq("processo_id", processoId);
  revalidatePath(`/legalizacao/processos/${processoId}`);
}
