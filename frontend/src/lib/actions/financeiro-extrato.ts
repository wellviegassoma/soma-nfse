"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { parseOfx, type LinhaOfx } from "@/lib/extrato-import/ofx";
import { parseCsvExtrato } from "@/lib/extrato-import/csv";

export type ExtratoActionState =
  | { error?: string; aviso?: string; sucesso?: string; at?: number }
  | undefined;

function revalidar(companyId: string) {
  revalidatePath(`/financeiro/empresas/${companyId}/conciliacao`);
  revalidatePath(`/financeiro/empresas/${companyId}/contas`);
  revalidatePath(`/financeiro/empresas/${companyId}/pagar`);
  revalidatePath(`/financeiro/empresas/${companyId}/receber`);
}

/**
 * Chave de deduplicação. FITID é o id que o próprio banco dá à transação —
 * quando existe, é o mais confiável possível. Sem ele, hash de data + valor +
 * descrição normalizada, que é o que se tem.
 *
 * Consequência aceita: duas transações idênticas no mesmo dia (duas tarifas
 * iguais, dois PIX iguais pro mesmo lugar) colidem e a segunda é tratada como
 * duplicada. Sem FITID não há como distinguir, e errar pro lado de não
 * duplicar o extrato é o menos ruim — o usuário pode lançar a segunda à mão.
 */
function calcularHash(linha: LinhaOfx): string {
  if (linha.fitid) return `fitid:${linha.fitid}`;
  const descricaoNormalizada = linha.descricao
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  const base = `${linha.data}|${linha.valor.toFixed(2)}|${descricaoNormalizada}`;
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------
// Importar extrato (OFX ou CSV)
// ---------------------------------------------------------------------------

const LIMITE_BYTES = 4 * 1024 * 1024; // Serverless Function da Vercel: ~4,5MB

export async function importarExtrato(
  _prevState: ExtratoActionState,
  formData: FormData,
): Promise<ExtratoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = z
    .object({ companyId: uuidLike, contaId: uuidLike })
    .safeParse({ companyId, contaId: formData.get("contaId") });
  if (!parsed.success) return { error: "Selecione a conta bancária." };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione um arquivo." };
  }
  if (arquivo.size > LIMITE_BYTES) {
    return { error: "Arquivo maior que 4MB. Importe em períodos menores." };
  }

  const nome = arquivo.name.toLowerCase();
  const ehOfx = nome.endsWith(".ofx") || nome.endsWith(".qfx");
  const ehCsv = nome.endsWith(".csv") || nome.endsWith(".txt");
  if (!ehOfx && !ehCsv) {
    return { error: "Formato não suportado. Envie .ofx ou .csv." };
  }

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  // Extrato de banco brasileiro costuma vir em latin1; ler como utf-8 estraga
  // acentos e, pior, muda o hash de dedupe entre importações.
  const comoUtf8 = bytes.toString("utf8");
  const conteudo = comoUtf8.includes("�") ? bytes.toString("latin1") : comoUtf8;

  let linhas: LinhaOfx[];
  let periodoInicio: string | null = null;
  let periodoFim: string | null = null;
  let avisoParser: string | undefined;

  if (ehOfx) {
    const r = parseOfx(conteudo);
    linhas = r.linhas;
    periodoInicio = r.periodoInicio;
    periodoFim = r.periodoFim;
    if (linhas.length === 0) {
      return { error: "Não encontrei nenhuma transação no OFX." };
    }
  } else {
    const r = parseCsvExtrato(conteudo);
    linhas = r.linhas;
    if (linhas.length === 0) {
      const cols = r.colunasEncontradas?.length
        ? ` Colunas encontradas: ${r.colunasEncontradas.join(", ")}.`
        : "";
      return { error: `${r.erro ?? "Não consegui ler o arquivo."}${cols}` };
    }
    avisoParser = r.erro;
  }

  const datas = linhas.map((l) => l.data).sort();
  periodoInicio = periodoInicio ?? datas[0] ?? null;
  periodoFim = periodoFim ?? datas[datas.length - 1] ?? null;

  const supabase = await createClient();

  const { data: importacao, error: erroImportacao } = await supabase
    .from("fin_importacoes")
    .insert({
      company_id: parsed.data.companyId,
      conta_id: parsed.data.contaId,
      origem: ehOfx ? "OFX" : "CSV",
      nome_arquivo: arquivo.name,
      periodo_inicio: periodoInicio,
      periodo_fim: periodoFim,
      linhas_lidas: linhas.length,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (erroImportacao || !importacao) {
    return { error: "Não foi possível registrar a importação." };
  }

  // Dedupe dentro do próprio arquivo antes de ir ao banco: sem isso, duas
  // linhas idênticas no mesmo arquivo derrubariam o upsert inteiro.
  const vistos = new Set<string>();
  const paraInserir = [];
  for (const l of linhas) {
    const hash = calcularHash(l);
    if (vistos.has(hash)) continue;
    vistos.add(hash);
    paraInserir.push({
      company_id: parsed.data.companyId,
      conta_id: parsed.data.contaId,
      importacao_id: importacao.id,
      data: l.data,
      descricao: l.descricao,
      documento: l.documento,
      valor: l.valor,
      origem: ehOfx ? "OFX" : "CSV",
      fitid: l.fitid,
      hash_dedupe: hash,
    });
  }

  // ignoreDuplicates: reimportar o mesmo período é rotina (o cliente manda o
  // extrato do mês inteiro toda vez). O unique (conta_id, hash_dedupe) barra,
  // e a gente conta quantas passaram pra mostrar ao usuário.
  const { data: inseridas, error: erroLinhas } = await supabase
    .from("fin_extrato_linhas")
    .upsert(paraInserir, { onConflict: "conta_id,hash_dedupe", ignoreDuplicates: true })
    .select("id");
  if (erroLinhas) {
    await supabase.from("fin_importacoes").delete().eq("id", importacao.id);
    return { error: "Não foi possível gravar as linhas do extrato." };
  }

  const novas = inseridas?.length ?? 0;
  const duplicadas = paraInserir.length - novas;

  await supabase
    .from("fin_importacoes")
    .update({ linhas_novas: novas, linhas_duplicadas: duplicadas })
    .eq("id", importacao.id);

  await logAudit({
    companyId: parsed.data.companyId,
    action: "IMPORT",
    entity: "fin_extrato",
    entityId: importacao.id,
    newValue: {
      arquivo: arquivo.name,
      origem: ehOfx ? "OFX" : "CSV",
      lidas: linhas.length,
      novas,
      duplicadas,
    },
  });

  revalidar(parsed.data.companyId);
  return {
    sucesso: `${novas} lançamento(s) novo(s) importado(s)${
      duplicadas > 0 ? `, ${duplicadas} já existia(m)` : ""
    }.`,
    aviso: avisoParser,
    at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Conciliar
// ---------------------------------------------------------------------------

/**
 * Concilia uma linha do extrato com um agendamento em aberto: cria a baixa
 * (fin_lancamentos) com a data e o valor que o BANCO informou — não os do
 * agendamento — e amarra os dois. Se o banco pagou diferente do previsto, o
 * agendamento fica parcial, que é a verdade.
 */
export async function conciliarComAgendamento(
  _prevState: ExtratoActionState,
  formData: FormData,
): Promise<ExtratoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);
  const user = await requireUser();

  const parsed = z
    .object({ companyId: uuidLike, linhaId: uuidLike, agendamentoId: uuidLike })
    .safeParse({
      companyId,
      linhaId: formData.get("linhaId"),
      agendamentoId: formData.get("agendamentoId"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();

  const { data: linha } = await supabase
    .from("fin_extrato_linhas")
    .select("id, conta_id, data, valor, status")
    .eq("id", parsed.data.linhaId)
    .eq("company_id", parsed.data.companyId)
    .single();
  if (!linha) return { error: "Linha do extrato não encontrada." };
  if (linha.status === "CONCILIADO") return { error: "Esta linha já está conciliada." };

  const { data: agendamento } = await supabase
    .from("fin_agendamentos")
    .select("id, tipo, status")
    .eq("id", parsed.data.agendamentoId)
    .eq("company_id", parsed.data.companyId)
    .single();
  if (!agendamento) return { error: "Agendamento não encontrado." };
  if (agendamento.status === "CANCELADO") {
    return { error: "Agendamento cancelado não pode ser conciliado." };
  }

  // Débito no banco só casa com conta a pagar, e crédito com conta a receber.
  const tipoEsperado = Number(linha.valor) < 0 ? "PAGAR" : "RECEBER";
  if (agendamento.tipo !== tipoEsperado) {
    return {
      error: `Esta linha é ${tipoEsperado === "PAGAR" ? "um débito" : "um crédito"} e o agendamento é ${
        agendamento.tipo === "PAGAR" ? "a pagar" : "a receber"
      }.`,
    };
  }

  const { data: lancamento, error: erroLancamento } = await supabase
    .from("fin_lancamentos")
    .insert({
      company_id: parsed.data.companyId,
      agendamento_id: parsed.data.agendamentoId,
      conta_id: linha.conta_id,
      data: linha.data,
      valor: linha.valor,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (erroLancamento || !lancamento) return { error: "Não foi possível criar a baixa." };

  const { error: erroConciliacao } = await supabase.from("fin_conciliacoes").insert({
    company_id: parsed.data.companyId,
    extrato_linha_id: parsed.data.linhaId,
    lancamento_id: lancamento.id,
    modo: "MANUAL",
    created_by: user.id,
  });
  if (erroConciliacao) {
    // Baixa sem conciliação mexeria no saldo sem deixar rastro da origem.
    await supabase.from("fin_lancamentos").delete().eq("id", lancamento.id);
    return { error: "Não foi possível conciliar." };
  }

  await logAudit({
    companyId: parsed.data.companyId,
    action: "RECONCILE",
    entity: "fin_extrato_linha",
    entityId: parsed.data.linhaId,
    newValue: { agendamentoId: parsed.data.agendamentoId, valor: linha.valor },
  });

  revalidar(parsed.data.companyId);
  return { sucesso: "Conciliado.", at: Date.now() };
}

/** Desfaz a conciliação e apaga a baixa que ela criou. */
export async function desconciliarLinha(
  _prevState: ExtratoActionState,
  formData: FormData,
): Promise<ExtratoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, linhaId: uuidLike })
    .safeParse({ companyId, linhaId: formData.get("linhaId") });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { data: vinculos } = await supabase
    .from("fin_conciliacoes")
    .select("id, lancamento_id")
    .eq("extrato_linha_id", parsed.data.linhaId)
    .eq("company_id", parsed.data.companyId);

  if (!vinculos?.length) return { error: "Esta linha não está conciliada." };

  // Apagar o lançamento leva a conciliação junto (cascade) e dispara os dois
  // triggers: status da linha volta a PENDENTE e o agendamento recalcula.
  const { error } = await supabase
    .from("fin_lancamentos")
    .delete()
    .in("id", vinculos.map((v) => v.lancamento_id));
  if (error) return { error: "Não foi possível desfazer a conciliação." };

  await logAudit({
    companyId: parsed.data.companyId,
    action: "UNRECONCILE",
    entity: "fin_extrato_linha",
    entityId: parsed.data.linhaId,
  });

  revalidar(parsed.data.companyId);
  return { sucesso: "Conciliação desfeita.", at: Date.now() };
}

/** Marca a linha como ignorada (transferência interna já lançada, estorno). */
export async function alternarIgnorarLinha(
  _prevState: ExtratoActionState,
  formData: FormData,
): Promise<ExtratoActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, linhaId: uuidLike, ignorar: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      linhaId: formData.get("linhaId"),
      ignorar: formData.get("ignorar"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_extrato_linhas")
    .update({ status: parsed.data.ignorar === "true" ? "IGNORADO" : "PENDENTE" })
    .eq("id", parsed.data.linhaId)
    .eq("company_id", parsed.data.companyId)
    // Linha conciliada não vira ignorada — teria de ser desconciliada antes.
    .neq("status", "CONCILIADO");
  if (error) return { error: "Não foi possível alterar a linha." };

  revalidar(parsed.data.companyId);
  return { at: Date.now() };
}
