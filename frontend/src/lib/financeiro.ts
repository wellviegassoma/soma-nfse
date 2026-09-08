// Tipos e rótulos do módulo Financeiro (ver docs/financeiro.md).
// Sem "server-only": os rótulos são usados também em componente de cliente.

export type ContatoTipo = "CLIENTE" | "FORNECEDOR" | "FUNCIONARIO" | "SOCIO";

export const CONTATO_TIPO_LABELS: Record<ContatoTipo, string> = {
  CLIENTE: "Cliente",
  FORNECEDOR: "Fornecedor",
  FUNCIONARIO: "Funcionário",
  SOCIO: "Sócio",
};

// Plural, pra título de aba/seção.
export const CONTATO_TIPO_LABELS_PLURAL: Record<ContatoTipo, string> = {
  CLIENTE: "Clientes",
  FORNECEDOR: "Fornecedores",
  FUNCIONARIO: "Funcionários",
  SOCIO: "Sócios",
};

export const CONTATO_TIPOS: ContatoTipo[] = [
  "CLIENTE",
  "FORNECEDOR",
  "FUNCIONARIO",
  "SOCIO",
];

// Os 4 grupos são a estrutura da DFC e não são configuráveis — é o que
// permite o Painel de acompanhamento somar operacional, investimento e
// financiamento sem o usuário ter que classificar de novo.
export type CategoriaGrupo =
  | "RECEITA_OPERACIONAL"
  | "CUSTO_DESPESA_OPERACIONAL"
  | "INVESTIMENTO"
  | "FINANCIAMENTO";

export const CATEGORIA_GRUPO_LABELS: Record<CategoriaGrupo, string> = {
  RECEITA_OPERACIONAL: "Receitas operacionais",
  CUSTO_DESPESA_OPERACIONAL: "Custos e despesas operacionais",
  INVESTIMENTO: "Atividades de investimento",
  FINANCIAMENTO: "Atividades de financiamento",
};

export const CATEGORIA_GRUPOS: CategoriaGrupo[] = [
  "RECEITA_OPERACIONAL",
  "CUSTO_DESPESA_OPERACIONAL",
  "INVESTIMENTO",
  "FINANCIAMENTO",
];

export type CategoriaNatureza = "ENTRADA" | "SAIDA";

export const CATEGORIA_NATUREZA_LABELS: Record<CategoriaNatureza, string> = {
  ENTRADA: "Entrada",
  SAIDA: "Saída",
};

export type ContaTipo = "CORRENTE" | "POUPANCA" | "CAIXA" | "APLICACAO";

export const CONTA_TIPO_LABELS: Record<ContaTipo, string> = {
  CORRENTE: "Conta corrente",
  POUPANCA: "Poupança",
  CAIXA: "Caixa",
  APLICACAO: "Aplicação",
};

export type FinContato = {
  id: string;
  company_id: string;
  tipo: ContatoTipo;
  nome: string;
  cpf_cnpj: string | null;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
  customer_id: string | null;
  ativo: boolean;
};

export type FinCategoria = {
  id: string;
  company_id: string;
  grupo: CategoriaGrupo;
  nome: string;
  natureza: CategoriaNatureza;
  sistema: boolean;
  codigo_sistema: string | null;
  conta_contabil: string | null;
  ordem: number;
  ativo: boolean;
};

export type FinCentroCusto = {
  id: string;
  company_id: string;
  nome: string;
  ativo: boolean;
};

// ---------------------------------------------------------------------------
// F2 — agendamentos e lançamentos
// ---------------------------------------------------------------------------

export type AgendamentoTipo = "RECEBER" | "PAGAR";

export const AGENDAMENTO_TIPO_LABELS: Record<AgendamentoTipo, string> = {
  RECEBER: "A receber",
  PAGAR: "A pagar",
};

export type AgendamentoStatus = "ABERTO" | "PARCIAL" | "LIQUIDADO" | "CANCELADO";

export const AGENDAMENTO_STATUS_LABELS: Record<AgendamentoStatus, string> = {
  ABERTO: "Em aberto",
  PARCIAL: "Parcial",
  LIQUIDADO: "Liquidado",
  CANCELADO: "Cancelado",
};

export type RecorrenciaFrequencia =
  | "SEMANAL"
  | "QUINZENAL"
  | "MENSAL"
  | "BIMESTRAL"
  | "TRIMESTRAL"
  | "SEMESTRAL"
  | "ANUAL";

export const FREQUENCIA_LABELS: Record<RecorrenciaFrequencia, string> = {
  SEMANAL: "Semanal",
  QUINZENAL: "Quinzenal",
  MENSAL: "Mensal",
  BIMESTRAL: "Bimestral",
  TRIMESTRAL: "Trimestral",
  SEMESTRAL: "Semestral",
  ANUAL: "Anual",
};

export const FREQUENCIAS: RecorrenciaFrequencia[] = [
  "SEMANAL",
  "QUINZENAL",
  "MENSAL",
  "BIMESTRAL",
  "TRIMESTRAL",
  "SEMESTRAL",
  "ANUAL",
];

export type FinAgendamento = {
  id: string;
  company_id: string;
  tipo: AgendamentoTipo;
  contato_id: string | null;
  vencimento: string;
  previsto_para: string | null;
  descricao: string | null;
  referencia: string | null;
  detalhamento: string | null;
  valor_bruto: number;
  ret_iss: number;
  ret_irrf: number;
  ret_csll: number;
  ret_inss: number;
  ret_pis: number;
  ret_cofins: number;
  ret_outras: number;
  desconto: number;
  juros: number;
  multa: number;
  valor_liquido: number;
  valor_liquidado: number;
  status: AgendamentoStatus;
  parcela_num: number | null;
  parcela_de: number | null;
  reembolsavel: boolean;
};

/** Soma das sete retenções de um agendamento. */
export function totalRetencoes(a: {
  ret_iss: number;
  ret_irrf: number;
  ret_csll: number;
  ret_inss: number;
  ret_pis: number;
  ret_cofins: number;
  ret_outras: number;
}): number {
  return (
    Number(a.ret_iss) +
    Number(a.ret_irrf) +
    Number(a.ret_csll) +
    Number(a.ret_inss) +
    Number(a.ret_pis) +
    Number(a.ret_cofins) +
    Number(a.ret_outras)
  );
}

/** Quanto ainda falta baixar. Nunca negativo. */
export function valorEmAberto(a: {
  valor_liquido: number;
  valor_liquidado: number;
}): number {
  return Math.max(0, Number(a.valor_liquido) - Number(a.valor_liquidado));
}

export function formatarBRL(valor: number): string {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "2026-09-07" -> "07/09/2026", sem passar por Date (evita fuso). */
export function formatarDataBr(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}
