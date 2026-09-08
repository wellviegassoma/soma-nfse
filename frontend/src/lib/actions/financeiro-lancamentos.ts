"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { RecorrenciaFrequencia } from "@/lib/financeiro";

export type LancamentoActionState =
  | {
      error?: string;
      success?: boolean;
      /**
       * Marca de tempo do sucesso. Serve de `key` no formulário: remontar os
       * campos limpa o estado deles sem precisar de setState dentro de efeito
       * (que dispara render em cascata — ver regra react-hooks/set-state-in-effect).
       */
      at?: number;
    }
  | undefined;

const dataBr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const dinheiro = z.coerce.number().finite().min(0);

function revalidar(companyId: string) {
  revalidatePath(`/financeiro/empresas/${companyId}`);
  revalidatePath(`/financeiro/empresas/${companyId}/pagar`);
  revalidatePath(`/financeiro/empresas/${companyId}/receber`);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Soma meses preservando o fim do mês: 31/01 + 1 mês = 28/02 (ou 29), não
 * 03/03 como o Date faria sozinho. Trabalha em UTC pra a data não escorregar
 * um dia por fuso.
 */
function somarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimoDia = new Date(
    Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0),
  ).getUTCDate();
  alvo.setUTCDate(Math.min(d, ultimoDia));
  return alvo.toISOString().slice(0, 10);
}

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1, d + dias));
  return alvo.toISOString().slice(0, 10);
}

const PASSO_MESES: Partial<Record<RecorrenciaFrequencia, number>> = {
  MENSAL: 1,
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
};

function proximaData(base: string, freq: RecorrenciaFrequencia, i: number): string {
  if (freq === "SEMANAL") return somarDias(base, 7 * i);
  if (freq === "QUINZENAL") return somarDias(base, 15 * i);
  return somarMeses(base, (PASSO_MESES[freq] ?? 1) * i);
}

// ---------------------------------------------------------------------------
// Criar agendamento (a pagar ou a receber)
// ---------------------------------------------------------------------------

const agendamentoSchema = z.object({
  companyId: uuidLike,
  tipo: z.enum(["RECEBER", "PAGAR"]),
  contatoId: uuidLike.optional(),
  categoriaId: uuidLike,
  vencimento: dataBr,
  previstoPara: dataBr.optional(),
  descricao: z.string().trim().optional(),
  referencia: z.string().trim().optional(),
  detalhamento: z.string().trim().optional(),
  valorBruto: z.coerce.number().finite().positive("Informe um valor maior que zero."),
  retIss: dinheiro.default(0),
  retIrrf: dinheiro.default(0),
  retCsll: dinheiro.default(0),
  retInss: dinheiro.default(0),
  retPis: dinheiro.default(0),
  retCofins: dinheiro.default(0),
  retOutras: dinheiro.default(0),
  desconto: dinheiro.default(0),
  juros: dinheiro.default(0),
  multa: dinheiro.default(0),
  centroCustoId: uuidLike.optional(),
  parcelas: z.coerce.number().int().min(1).max(360).default(1),
  frequencia: z
    .enum(["SEMANAL", "QUINZENAL", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"])
    .default("MENSAL"),
});

function lerAgendamento(formData: FormData) {
  return agendamentoSchema.safeParse({
    companyId: formData.get("companyId"),
    tipo: formData.get("tipo"),
    contatoId: formData.get("contatoId") || undefined,
    categoriaId: formData.get("categoriaId"),
    vencimento: formData.get("vencimento"),
    previstoPara: formData.get("previstoPara") || undefined,
    descricao: formData.get("descricao") || undefined,
    referencia: formData.get("referencia") || undefined,
    detalhamento: formData.get("detalhamento") || undefined,
    valorBruto: formData.get("valorBruto"),
    retIss: formData.get("retIss") || 0,
    retIrrf: formData.get("retIrrf") || 0,
    retCsll: formData.get("retCsll") || 0,
    retInss: formData.get("retInss") || 0,
    retPis: formData.get("retPis") || 0,
    retCofins: formData.get("retCofins") || 0,
    retOutras: formData.get("retOutras") || 0,
    desconto: formData.get("desconto") || 0,
    juros: formData.get("juros") || 0,
    multa: formData.get("multa") || 0,
    centroCustoId: formData.get("centroCustoId") || undefined,
    parcelas: formData.get("parcelas") || 1,
    frequencia: formData.get("frequencia") || "MENSAL",
  });
}

export async function criarAgendamento(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = lerAgendamento(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const totalRet =
    d.retIss + d.retIrrf + d.retCsll + d.retInss + d.retPis + d.retCofins + d.retOutras;
  if (totalRet + d.desconto > d.valorBruto) {
    return { error: "Retenções e desconto somam mais que o valor bruto." };
  }

  const supabase = await createClient();

  // Parcelamento: divide o bruto e as retenções entre as parcelas, jogando a
  // sobra de centavos na PRIMEIRA — assim a soma das parcelas bate exatamente
  // com o total, sem um centavo aparecendo do nada na última.
  const n = d.parcelas;
  const recorrenciaId = await (async () => {
    if (n <= 1) return null;
    const { data, error } = await supabase
      .from("fin_recorrencias")
      .insert({
        company_id: d.companyId,
        tipo: d.tipo,
        modo: "PARCELAMENTO",
        frequencia: d.frequencia,
        parcelas: n,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id as string;
  })().catch(() => null);

  if (n > 1 && !recorrenciaId) {
    return { error: "Não foi possível criar o parcelamento." };
  }

  function fatia(total: number, i: number): number {
    const base = round2(Math.floor((total * 100) / n) / 100);
    if (i > 0) return base;
    return round2(total - base * (n - 1));
  }

  const linhas = Array.from({ length: n }, (_, i) => ({
    company_id: d.companyId,
    tipo: d.tipo,
    contato_id: d.contatoId ?? null,
    vencimento: proximaData(d.vencimento, d.frequencia, i),
    previsto_para: d.previstoPara ? proximaData(d.previstoPara, d.frequencia, i) : null,
    descricao: d.descricao ?? null,
    referencia: d.referencia ?? null,
    detalhamento: d.detalhamento ?? null,
    valor_bruto: fatia(d.valorBruto, i),
    ret_iss: fatia(d.retIss, i),
    ret_irrf: fatia(d.retIrrf, i),
    ret_csll: fatia(d.retCsll, i),
    ret_inss: fatia(d.retInss, i),
    ret_pis: fatia(d.retPis, i),
    ret_cofins: fatia(d.retCofins, i),
    ret_outras: fatia(d.retOutras, i),
    desconto: fatia(d.desconto, i),
    juros: fatia(d.juros, i),
    multa: fatia(d.multa, i),
    recorrencia_id: recorrenciaId,
    parcela_num: n > 1 ? i + 1 : null,
    parcela_de: n > 1 ? n : null,
    created_by: user.id,
  }));

  const { data: criados, error } = await supabase
    .from("fin_agendamentos")
    .insert(linhas)
    .select("id, valor_bruto");
  if (error || !criados) {
    return { error: "Não foi possível criar o agendamento." };
  }

  // Rateio: uma linha por agendamento com o valor da própria parcela, pra a
  // soma do rateio fechar com o bruto de cada uma.
  const rateioCategorias = criados.map((a) => ({
    agendamento_id: a.id,
    categoria_id: d.categoriaId,
    valor: a.valor_bruto,
  }));
  const { error: erroCategoria } = await supabase
    .from("fin_agendamento_categorias")
    .insert(rateioCategorias);
  if (erroCategoria) {
    // Sem categoria o agendamento não entra em nenhum relatório — melhor
    // desfazer do que deixar um registro órfão de classificação.
    await supabase.from("fin_agendamentos").delete().in(
      "id",
      criados.map((a) => a.id),
    );
    return { error: "Não foi possível classificar o agendamento na categoria." };
  }

  if (d.centroCustoId) {
    await supabase.from("fin_agendamento_centros_custo").insert(
      criados.map((a) => ({
        agendamento_id: a.id,
        centro_custo_id: d.centroCustoId!,
        percentual: 100,
        valor: a.valor_bruto,
      })),
    );
  }

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_agendamento",
    entityId: criados[0]?.id,
    newValue: {
      tipo: d.tipo,
      valorBruto: d.valorBruto,
      parcelas: n,
      vencimento: d.vencimento,
      retencoes: totalRet,
    },
  });

  revalidar(d.companyId);
  return { success: true, at: Date.now() };
}

// ---------------------------------------------------------------------------
// Baixa (pagar / receber), com valor parcial
// ---------------------------------------------------------------------------

const baixaSchema = z.object({
  companyId: uuidLike,
  agendamentoId: uuidLike,
  contaId: uuidLike,
  data: dataBr,
  valor: z.coerce.number().finite().positive("Informe um valor maior que zero."),
});

export async function baixarAgendamento(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = baixaSchema.safeParse({
    companyId,
    agendamentoId: formData.get("agendamentoId"),
    contaId: formData.get("contaId"),
    data: formData.get("data"),
    valor: formData.get("valor"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: ag } = await supabase
    .from("fin_agendamentos")
    .select("id, tipo, status, valor_liquido, valor_liquidado")
    .eq("id", d.agendamentoId)
    .eq("company_id", d.companyId)
    .single();
  if (!ag) return { error: "Agendamento não encontrado." };
  if (ag.status === "CANCELADO") return { error: "Agendamento cancelado não aceita baixa." };
  if (ag.status === "LIQUIDADO") return { error: "Agendamento já está liquidado." };

  // Sinal do lançamento vem do tipo: receber entra na conta, pagar sai.
  const valorComSinal = ag.tipo === "RECEBER" ? d.valor : -d.valor;

  const { error } = await supabase.from("fin_lancamentos").insert({
    company_id: d.companyId,
    agendamento_id: d.agendamentoId,
    conta_id: d.contaId,
    data: d.data,
    valor: valorComSinal,
    created_by: user.id,
  });
  if (error) return { error: "Não foi possível registrar a baixa." };

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_lancamento",
    entityId: d.agendamentoId,
    newValue: { valor: d.valor, data: d.data, contaId: d.contaId, tipo: ag.tipo },
  });

  revalidar(d.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Cancelar agendamento
// ---------------------------------------------------------------------------

export async function cancelarAgendamento(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, agendamentoId: uuidLike })
    .safeParse({ companyId, agendamentoId: formData.get("agendamentoId") });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { data: ag } = await supabase
    .from("fin_agendamentos")
    .select("valor_liquidado")
    .eq("id", parsed.data.agendamentoId)
    .eq("company_id", parsed.data.companyId)
    .single();
  if (!ag) return { error: "Agendamento não encontrado." };
  if (Number(ag.valor_liquidado) > 0) {
    return {
      error:
        "Este agendamento já tem baixa registrada. Apague a baixa antes de cancelar, pra o saldo da conta não ficar errado.",
    };
  }

  const { error } = await supabase
    .from("fin_agendamentos")
    .update({ status: "CANCELADO" })
    .eq("id", parsed.data.agendamentoId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível cancelar." };

  await logAudit({
    companyId: parsed.data.companyId,
    action: "CANCEL",
    entity: "fin_agendamento",
    entityId: parsed.data.agendamentoId,
  });

  revalidar(parsed.data.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Transferência entre contas
// ---------------------------------------------------------------------------

export async function criarTransferencia(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = z
    .object({
      companyId: uuidLike,
      contaOrigemId: uuidLike,
      contaDestinoId: uuidLike,
      data: dataBr,
      valor: z.coerce.number().finite().positive("Informe um valor maior que zero."),
      descricao: z.string().trim().optional(),
    })
    .safeParse({
      companyId,
      contaOrigemId: formData.get("contaOrigemId"),
      contaDestinoId: formData.get("contaDestinoId"),
      data: formData.get("data"),
      valor: formData.get("valor"),
      descricao: formData.get("descricao") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;
  if (d.contaOrigemId === d.contaDestinoId) {
    return { error: "Origem e destino não podem ser a mesma conta." };
  }

  const supabase = await createClient();
  const { data: transf, error } = await supabase
    .from("fin_transferencias")
    .insert({
      company_id: d.companyId,
      conta_origem_id: d.contaOrigemId,
      conta_destino_id: d.contaDestinoId,
      data: d.data,
      valor: d.valor,
      descricao: d.descricao ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !transf) return { error: "Não foi possível registrar a transferência." };

  const { error: erroPernas } = await supabase.from("fin_lancamentos").insert([
    {
      company_id: d.companyId,
      transferencia_id: transf.id,
      conta_id: d.contaOrigemId,
      data: d.data,
      valor: -d.valor,
      created_by: user.id,
    },
    {
      company_id: d.companyId,
      transferencia_id: transf.id,
      conta_id: d.contaDestinoId,
      data: d.data,
      valor: d.valor,
      created_by: user.id,
    },
  ]);
  if (erroPernas) {
    // Transferência sem as duas pernas mentiria no saldo das duas contas.
    await supabase.from("fin_transferencias").delete().eq("id", transf.id);
    return { error: "Não foi possível registrar a transferência." };
  }

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_transferencia",
    entityId: transf.id,
    newValue: { valor: d.valor, data: d.data },
  });

  revalidar(d.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Recorrência contínua (aluguel, honorário, mensalidade)
//
// Diferente do parcelamento, não tem fim conhecido. A recorrência guarda o
// modelo e o banco gera um horizonte à frente (fin_gerar_recorrencias), aqui
// na criação e todo dia pelo cron.
// ---------------------------------------------------------------------------

const recorrenciaSchema = z.object({
  companyId: uuidLike,
  tipo: z.enum(["RECEBER", "PAGAR"]),
  contatoId: uuidLike.optional(),
  categoriaId: uuidLike,
  centroCustoId: uuidLike.optional(),
  descricao: z.string().trim().optional(),
  referencia: z.string().trim().optional(),
  valorBruto: z.coerce.number().finite().positive("Informe um valor maior que zero."),
  frequencia: z
    .enum(["SEMANAL", "QUINZENAL", "MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"])
    .default("MENSAL"),
  dataInicio: dataBr,
  dataFim: dataBr.optional(),
  retIss: dinheiro.default(0),
  retIrrf: dinheiro.default(0),
  retCsll: dinheiro.default(0),
  retInss: dinheiro.default(0),
  retPis: dinheiro.default(0),
  retCofins: dinheiro.default(0),
  retOutras: dinheiro.default(0),
  desconto: dinheiro.default(0),
});

export async function criarRecorrencia(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = recorrenciaSchema.safeParse({
    companyId,
    tipo: formData.get("tipo"),
    contatoId: formData.get("contatoId") || undefined,
    categoriaId: formData.get("categoriaId"),
    centroCustoId: formData.get("centroCustoId") || undefined,
    descricao: formData.get("descricao") || undefined,
    referencia: formData.get("referencia") || undefined,
    valorBruto: formData.get("valorBruto"),
    frequencia: formData.get("frequencia") || "MENSAL",
    dataInicio: formData.get("dataInicio"),
    dataFim: formData.get("dataFim") || undefined,
    retIss: formData.get("retIss") || 0,
    retIrrf: formData.get("retIrrf") || 0,
    retCsll: formData.get("retCsll") || 0,
    retInss: formData.get("retInss") || 0,
    retPis: formData.get("retPis") || 0,
    retCofins: formData.get("retCofins") || 0,
    retOutras: formData.get("retOutras") || 0,
    desconto: formData.get("desconto") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  if (d.dataFim && d.dataFim < d.dataInicio) {
    return { error: "A data de fim não pode ser anterior à de início." };
  }
  const totalRet =
    d.retIss + d.retIrrf + d.retCsll + d.retInss + d.retPis + d.retCofins + d.retOutras;
  if (totalRet + d.desconto > d.valorBruto) {
    return { error: "Retenções e desconto somam mais que o valor bruto." };
  }

  const supabase = await createClient();
  const { data: rec, error } = await supabase
    .from("fin_recorrencias")
    .insert({
      company_id: d.companyId,
      tipo: d.tipo,
      modo: "RECORRENCIA",
      frequencia: d.frequencia,
      contato_id: d.contatoId ?? null,
      categoria_id: d.categoriaId,
      centro_custo_id: d.centroCustoId ?? null,
      descricao: d.descricao ?? null,
      referencia: d.referencia ?? null,
      valor_bruto: d.valorBruto,
      ret_iss: d.retIss,
      ret_irrf: d.retIrrf,
      ret_csll: d.retCsll,
      ret_inss: d.retInss,
      ret_pis: d.retPis,
      ret_cofins: d.retCofins,
      ret_outras: d.retOutras,
      desconto: d.desconto,
      data_inicio: d.dataInicio,
      data_fim: d.dataFim ?? null,
    })
    .select("id")
    .single();
  if (error || !rec) return { error: "Não foi possível criar a recorrência." };

  const { error: erroGeracao } = await supabase.rpc("fin_gerar_recorrencias", {
    p_company_id: d.companyId,
  });
  if (erroGeracao) {
    // Recorrência sem nenhuma ocorrência gerada é invisível pro usuário — ele
    // acharia que não salvou. Melhor desfazer e deixar ele tentar de novo.
    await supabase.from("fin_recorrencias").delete().eq("id", rec.id);
    return { error: "Não foi possível gerar os lançamentos da recorrência." };
  }

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_recorrencia",
    entityId: rec.id,
    newValue: {
      tipo: d.tipo,
      frequencia: d.frequencia,
      valorBruto: d.valorBruto,
      dataInicio: d.dataInicio,
      dataFim: d.dataFim,
    },
  });

  revalidar(d.companyId);
  return { success: true, at: Date.now() };
}

export async function alternarRecorrenciaAtiva(
  _prevState: LancamentoActionState,
  formData: FormData,
): Promise<LancamentoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, recorrenciaId: uuidLike, ativa: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      recorrenciaId: formData.get("recorrenciaId"),
      ativa: formData.get("ativa"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };
  const ativa = parsed.data.ativa === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_recorrencias")
    .update({ ativa })
    .eq("id", parsed.data.recorrenciaId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível alterar a recorrência." };

  // Reativar tem de voltar a gerar imediatamente; senão o usuário só veria as
  // contas aparecerem na próxima passada do cron, e acharia que não funcionou.
  if (ativa) {
    await supabase.rpc("fin_gerar_recorrencias", { p_company_id: parsed.data.companyId });
  }

  await logAudit({
    companyId: parsed.data.companyId,
    action: ativa ? "ACTIVATE" : "DEACTIVATE",
    entity: "fin_recorrencia",
    entityId: parsed.data.recorrenciaId,
  });

  revalidar(parsed.data.companyId);
  return { success: true, at: Date.now() };
}

/** Completa o horizonte sob demanda — botão "Gerar agora". */
export async function gerarRecorrenciasAgora(
  companyId: string,
): Promise<{ error?: string; criados?: number }> {
  await requireFinanceiroAccess(companyId);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_gerar_recorrencias", {
    p_company_id: companyId,
  });
  if (error) return { error: "Não foi possível gerar." };
  revalidar(companyId);
  return { criados: Number(data ?? 0) };
}
