"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";

export type FinanceiroActionState =
  | { error?: string; success?: boolean }
  | undefined;

function revalidarEmpresa(companyId: string) {
  revalidatePath(`/financeiro/empresas/${companyId}`);
  revalidatePath(`/financeiro/empresas/${companyId}/contatos`);
  revalidatePath(`/financeiro/empresas/${companyId}/config`);
  revalidatePath("/financeiro");
}

// ---------------------------------------------------------------------------
// Plano de categorias padrão
// ---------------------------------------------------------------------------

/**
 * Semeia o plano padrão da empresa. Chamado na primeira vez que a tela de
 * configuração abre — não em massa nas ~215 empresas, porque só um punhado usa
 * financeiro. A função no banco é idempotente: se a empresa já tem qualquer
 * categoria, não faz nada (não repõe o que o usuário apagou de propósito).
 */
export async function semearCategoriasPadrao(
  companyId: string,
): Promise<{ error?: string }> {
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const { error } = await supabase.rpc("fin_seed_categorias_padrao", {
    p_company_id: companyId,
  });
  if (error) return { error: "Não foi possível criar o plano de categorias." };

  revalidarEmpresa(companyId);
  return {};
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

const contatoSchema = z.object({
  companyId: uuidLike,
  tipo: z.enum(["CLIENTE", "FORNECEDOR", "FUNCIONARIO", "SOCIO"]),
  nome: z.string().trim().min(1, "Informe o nome."),
  cpfCnpj: z.string().trim().optional(),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  telefone: z.string().trim().optional(),
  observacoes: z.string().trim().optional(),
});

export async function criarContato(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = contatoSchema.safeParse({
    companyId,
    tipo: formData.get("tipo"),
    nome: formData.get("nome"),
    cpfCnpj: formData.get("cpfCnpj") || undefined,
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("fin_contatos").insert({
    company_id: d.companyId,
    tipo: d.tipo,
    nome: d.nome,
    cpf_cnpj: d.cpfCnpj || null,
    email: d.email || null,
    telefone: d.telefone || null,
    observacoes: d.observacoes || null,
  });
  if (error) return { error: "Não foi possível cadastrar o contato." };

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_contato",
    newValue: { tipo: d.tipo, nome: d.nome, cpfCnpj: d.cpfCnpj },
  });
  revalidarEmpresa(d.companyId);
  return { success: true };
}

const atualizarContatoSchema = contatoSchema.extend({ contatoId: uuidLike });

export async function atualizarContato(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = atualizarContatoSchema.safeParse({
    contatoId: formData.get("contatoId"),
    companyId,
    tipo: formData.get("tipo"),
    nome: formData.get("nome"),
    cpfCnpj: formData.get("cpfCnpj") || undefined,
    email: formData.get("email") || undefined,
    telefone: formData.get("telefone") || undefined,
    observacoes: formData.get("observacoes") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_contatos")
    .update({
      tipo: d.tipo,
      nome: d.nome,
      cpf_cnpj: d.cpfCnpj || null,
      email: d.email || null,
      telefone: d.telefone || null,
      observacoes: d.observacoes || null,
    })
    .eq("id", d.contatoId)
    .eq("company_id", d.companyId);
  if (error) return { error: "Não foi possível atualizar o contato." };

  await logAudit({
    companyId: d.companyId,
    action: "UPDATE",
    entity: "fin_contato",
    entityId: d.contatoId,
    newValue: { tipo: d.tipo, nome: d.nome, cpfCnpj: d.cpfCnpj },
  });
  revalidarEmpresa(d.companyId);
  return { success: true };
}

/**
 * Inativa em vez de apagar: contato já usado em agendamento não pode sumir do
 * histórico (mesma escolha já feita em extrato_contas_bancarias.ativo).
 */
export async function alternarContatoAtivo(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, contatoId: uuidLike, ativo: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      contatoId: formData.get("contatoId"),
      ativo: formData.get("ativo"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };
  const ativo = parsed.data.ativo === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_contatos")
    .update({ ativo })
    .eq("id", parsed.data.contatoId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível alterar o contato." };

  await logAudit({
    companyId: parsed.data.companyId,
    action: ativo ? "ACTIVATE" : "DEACTIVATE",
    entity: "fin_contato",
    entityId: parsed.data.contatoId,
  });
  revalidarEmpresa(parsed.data.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

const categoriaSchema = z.object({
  companyId: uuidLike,
  grupo: z.enum([
    "RECEITA_OPERACIONAL",
    "CUSTO_DESPESA_OPERACIONAL",
    "INVESTIMENTO",
    "FINANCIAMENTO",
  ]),
  nome: z.string().trim().min(1, "Informe o nome da categoria."),
  natureza: z.enum(["ENTRADA", "SAIDA"]),
  contaContabil: z.string().trim().optional(),
});

export async function criarCategoria(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = categoriaSchema.safeParse({
    companyId,
    grupo: formData.get("grupo"),
    nome: formData.get("nome"),
    natureza: formData.get("natureza"),
    contaContabil: formData.get("contaContabil") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("fin_categorias").insert({
    company_id: d.companyId,
    grupo: d.grupo,
    nome: d.nome,
    natureza: d.natureza,
    conta_contabil: d.contaContabil || null,
    // ordem alta pra categoria nova cair no fim do próprio grupo, sem
    // reordenar o plano padrão inteiro.
    ordem: 9000,
  });
  if (error) {
    // unique (company_id, nome)
    if (error.code === "23505") return { error: "Já existe uma categoria com esse nome." };
    return { error: "Não foi possível criar a categoria." };
  }

  await logAudit({
    companyId: d.companyId,
    action: "CREATE",
    entity: "fin_categoria",
    newValue: { grupo: d.grupo, nome: d.nome, natureza: d.natureza },
  });
  revalidarEmpresa(d.companyId);
  return { success: true };
}

const atualizarCategoriaSchema = categoriaSchema.extend({ categoriaId: uuidLike });

export async function atualizarCategoria(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = atualizarCategoriaSchema.safeParse({
    categoriaId: formData.get("categoriaId"),
    companyId,
    grupo: formData.get("grupo"),
    nome: formData.get("nome"),
    natureza: formData.get("natureza"),
    contaContabil: formData.get("contaContabil") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  const supabase = await createClient();

  // Categoria de sistema (juros, multa, desconto, retenção) só aceita o
  // mapeamento contábil e o nome — grupo e natureza são o que o cálculo do
  // lançamento usa pra saber onde jogar o valor. Checagem aqui além da RLS
  // porque isso é regra de negócio, não de acesso.
  const { data: atual } = await supabase
    .from("fin_categorias")
    .select("sistema, grupo, natureza")
    .eq("id", d.categoriaId)
    .eq("company_id", d.companyId)
    .single();
  if (!atual) return { error: "Categoria não encontrada." };
  if (atual.sistema && (atual.grupo !== d.grupo || atual.natureza !== d.natureza)) {
    return {
      error:
        "Categoria de sistema: dá pra renomear e mapear a conta contábil, mas não mudar grupo ou natureza.",
    };
  }

  const { error } = await supabase
    .from("fin_categorias")
    .update({
      grupo: d.grupo,
      nome: d.nome,
      natureza: d.natureza,
      conta_contabil: d.contaContabil || null,
    })
    .eq("id", d.categoriaId)
    .eq("company_id", d.companyId);
  if (error) {
    if (error.code === "23505") return { error: "Já existe uma categoria com esse nome." };
    return { error: "Não foi possível atualizar a categoria." };
  }

  await logAudit({
    companyId: d.companyId,
    action: "UPDATE",
    entity: "fin_categoria",
    entityId: d.categoriaId,
    newValue: { grupo: d.grupo, nome: d.nome, natureza: d.natureza },
  });
  revalidarEmpresa(d.companyId);
  return { success: true };
}

export async function alternarCategoriaAtiva(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, categoriaId: uuidLike, ativo: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      categoriaId: formData.get("categoriaId"),
      ativo: formData.get("ativo"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };
  const ativo = parsed.data.ativo === "true";

  const supabase = await createClient();

  // Categoria de sistema não pode ser desativada: sem ela o cálculo de juros,
  // multa, desconto ou retenção não tem onde lançar o valor.
  if (!ativo) {
    const { data: atual } = await supabase
      .from("fin_categorias")
      .select("sistema")
      .eq("id", parsed.data.categoriaId)
      .eq("company_id", parsed.data.companyId)
      .single();
    if (atual?.sistema) {
      return { error: "Categoria de sistema não pode ser desativada." };
    }
  }

  const { error } = await supabase
    .from("fin_categorias")
    .update({ ativo })
    .eq("id", parsed.data.categoriaId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível alterar a categoria." };

  await logAudit({
    companyId: parsed.data.companyId,
    action: ativo ? "ACTIVATE" : "DEACTIVATE",
    entity: "fin_categoria",
    entityId: parsed.data.categoriaId,
  });
  revalidarEmpresa(parsed.data.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Centros de custo
// ---------------------------------------------------------------------------

export async function criarCentroCusto(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, nome: z.string().trim().min(1, "Informe o nome.") })
    .safeParse({ companyId, nome: formData.get("nome") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("fin_centros_custo").insert({
    company_id: parsed.data.companyId,
    nome: parsed.data.nome,
  });
  if (error) {
    if (error.code === "23505") return { error: "Já existe um centro de custo com esse nome." };
    return { error: "Não foi possível criar o centro de custo." };
  }

  await logAudit({
    companyId: parsed.data.companyId,
    action: "CREATE",
    entity: "fin_centro_custo",
    newValue: { nome: parsed.data.nome },
  });
  revalidarEmpresa(parsed.data.companyId);
  return { success: true };
}

export async function alternarCentroCustoAtivo(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({ companyId: uuidLike, centroId: uuidLike, ativo: z.enum(["true", "false"]) })
    .safeParse({
      companyId,
      centroId: formData.get("centroId"),
      ativo: formData.get("ativo"),
    });
  if (!parsed.success) return { error: "Dados inválidos." };
  const ativo = parsed.data.ativo === "true";

  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_centros_custo")
    .update({ ativo })
    .eq("id", parsed.data.centroId)
    .eq("company_id", parsed.data.companyId);
  if (error) return { error: "Não foi possível alterar o centro de custo." };

  await logAudit({
    companyId: parsed.data.companyId,
    action: ativo ? "ACTIVATE" : "DEACTIVATE",
    entity: "fin_centro_custo",
    entityId: parsed.data.centroId,
  });
  revalidarEmpresa(parsed.data.companyId);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Conta bancária — cadastro canônico é extrato_contas_bancarias (ver
// docs/financeiro.md). Aqui só os campos que o financeiro acrescentou; o
// cadastro em si continua no módulo Extratos.
// ---------------------------------------------------------------------------

export async function atualizarDadosFinanceirosConta(
  _prevState: FinanceiroActionState,
  formData: FormData,
): Promise<FinanceiroActionState> {
  const companyId = String(formData.get("companyId") ?? "");
  await requireFinanceiroAccess(companyId);

  const parsed = z
    .object({
      companyId: uuidLike,
      contaId: uuidLike,
      tipo: z.enum(["CORRENTE", "POUPANCA", "CAIXA", "APLICACAO"]),
      saldoInicial: z.coerce.number().finite(),
      dataSaldoInicial: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
        .optional(),
    })
    .safeParse({
      companyId,
      contaId: formData.get("contaId"),
      tipo: formData.get("tipo"),
      saldoInicial: formData.get("saldoInicial") || 0,
      dataSaldoInicial: formData.get("dataSaldoInicial") || undefined,
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const d = parsed.data;

  // Saldo inicial sem data não significa nada — o saldo calculado é
  // saldo_inicial + lançamentos a partir dessa data.
  if (d.saldoInicial !== 0 && !d.dataSaldoInicial) {
    return { error: "Informe a data do saldo inicial." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("extrato_contas_bancarias")
    .update({
      tipo: d.tipo,
      saldo_inicial: d.saldoInicial,
      data_saldo_inicial: d.dataSaldoInicial || null,
    })
    .eq("id", d.contaId)
    .eq("company_id", d.companyId);
  if (error) return { error: "Não foi possível atualizar a conta." };

  await logAudit({
    companyId: d.companyId,
    action: "UPDATE",
    entity: "fin_conta_dados",
    entityId: d.contaId,
    newValue: {
      tipo: d.tipo,
      saldoInicial: d.saldoInicial,
      dataSaldoInicial: d.dataSaldoInicial,
    },
  });
  revalidarEmpresa(d.companyId);
  return { success: true };
}
