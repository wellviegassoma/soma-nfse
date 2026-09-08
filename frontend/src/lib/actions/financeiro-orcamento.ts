"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type OrcamentoActionState =
  | { error?: string; sucesso?: string; at?: number }
  | undefined;

const competenciaSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência inválida.");

function revalidar(companyId: string) {
  revalidatePath(`/financeiro/empresas/${companyId}/orcamento`);
  revalidatePath(`/financeiro/empresas/${companyId}/painel`);
}

/**
 * Salva o orçamento de uma competência inteira de uma vez.
 *
 * Linha zerada é APAGADA, não gravada como zero: "não orçado" e "orçado zero"
 * são coisas diferentes no comparativo — a primeira não deve aparecer, a
 * segunda significa "não é pra gastar nada aqui".
 */
export async function salvarOrcamento(
  _prevState: OrcamentoActionState,
  formData: FormData,
): Promise<OrcamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsedBase = z
    .object({ companyId: uuidLike, competencia: competenciaSchema })
    .safeParse({ companyId, competencia: formData.get("competencia") });
  if (!parsedBase.success) {
    return { error: parsedBase.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { competencia } = parsedBase.data;

  // Campos vêm como valor_<uuid>.
  const paraGravar: { categoriaId: string; valor: number }[] = [];
  const paraApagar: string[] = [];

  for (const [chave, bruto] of formData.entries()) {
    if (!chave.startsWith("valor_")) continue;
    const categoriaId = chave.slice("valor_".length);
    if (!uuidLike.safeParse(categoriaId).success) continue;

    const texto = String(bruto).trim().replace(",", ".");
    if (!texto) {
      paraApagar.push(categoriaId);
      continue;
    }
    const valor = Number(texto);
    if (!Number.isFinite(valor) || valor < 0) {
      return { error: "Todos os valores precisam ser números maiores ou iguais a zero." };
    }
    if (valor === 0) {
      paraApagar.push(categoriaId);
      continue;
    }
    paraGravar.push({ categoriaId, valor: Math.round(valor * 100) / 100 });
  }

  const supabase = await createClient();

  if (paraApagar.length > 0) {
    const { error } = await supabase
      .from("fin_orcamento")
      .delete()
      .eq("company_id", companyId)
      .eq("competencia", competencia)
      .in("categoria_id", paraApagar);
    if (error) return { error: "Não foi possível limpar as linhas zeradas." };
  }

  if (paraGravar.length > 0) {
    const { error } = await supabase.from("fin_orcamento").upsert(
      paraGravar.map((l) => ({
        company_id: companyId,
        categoria_id: l.categoriaId,
        competencia,
        valor: l.valor,
      })),
      { onConflict: "categoria_id,competencia" },
    );
    if (error) return { error: "Não foi possível salvar o orçamento." };
  }

  await logAudit({
    companyId,
    action: "UPDATE",
    entity: "fin_orcamento",
    newValue: { competencia, linhas: paraGravar.length, removidas: paraApagar.length },
  });

  revalidar(companyId);
  return {
    sucesso: `Orçamento de ${competencia} salvo (${paraGravar.length} categoria(s)).`,
    at: Date.now(),
  };
}

/**
 * Copia o orçamento de uma competência pra outra. Montar do zero mês a mês é
 * o que faz a funcionalidade ser abandonada; o uso real é copiar e ajustar.
 */
export async function copiarOrcamento(
  _prevState: OrcamentoActionState,
  formData: FormData,
): Promise<OrcamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({
      companyId: uuidLike,
      origem: competenciaSchema,
      destino: competenciaSchema,
    })
    .safeParse({
      companyId,
      origem: formData.get("origem"),
      destino: formData.get("destino"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.origem === parsed.data.destino) {
    return { error: "Origem e destino são a mesma competência." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_copiar_orcamento", {
    p_company_id: parsed.data.companyId,
    p_origem: parsed.data.origem,
    p_destino: parsed.data.destino,
  });
  if (error) return { error: "Não foi possível copiar o orçamento." };

  const copiadas = Number(data ?? 0);
  revalidar(parsed.data.companyId);
  return {
    sucesso: copiadas
      ? `${copiadas} linha(s) copiada(s) de ${parsed.data.origem}. Linhas já ajustadas no destino foram mantidas.`
      : "Nada a copiar: o destino já tem todas as linhas da origem.",
    at: Date.now(),
  };
}
