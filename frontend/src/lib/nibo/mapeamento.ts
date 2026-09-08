// Tradução Nibo -> SOMA Gestão. Funções puras, testáveis sem rede: é aqui que
// a migração acerta ou erra, e um mapeamento errado só apareceria depois, com
// os dados do cliente já dentro.

import type { CategoriaGrupo, CategoriaNatureza, ContatoTipo } from "@/lib/financeiro";
import type { NiboAgendamento, NiboCategoria, NiboConta, NiboContato } from "./client";

/**
 * Grupo da categoria. O Nibo manda `group.name` em texto livre por empresa,
 * então casa por palavra-chave normalizada em vez de igualdade exata — a mesma
 * empresa pode ter "Receitas Operacionais" e outra "RECEITA OPERACIONAL".
 *
 * O que não casar cai em CUSTO_DESPESA_OPERACIONAL e é REPORTADO, não
 * silenciado: categoria no grupo errado desloca o DRE inteiro, e é melhor o
 * operador conferir uma lista curta do que descobrir depois.
 */
export function mapearGrupo(nome: string | null | undefined): {
  grupo: CategoriaGrupo;
  confiante: boolean;
} {
  const n = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

  if (n.includes("investimento")) return { grupo: "INVESTIMENTO", confiante: true };
  if (n.includes("financiamento")) return { grupo: "FINANCIAMENTO", confiante: true };
  if (n.includes("receita") || n.includes("entrada"))
    return { grupo: "RECEITA_OPERACIONAL", confiante: true };
  if (n.includes("custo") || n.includes("despesa") || n.includes("saida"))
    return { grupo: "CUSTO_DESPESA_OPERACIONAL", confiante: true };

  return { grupo: "CUSTO_DESPESA_OPERACIONAL", confiante: false };
}

/** `type` da categoria no Nibo: "In"/"Credit"/"Receita" = entrada. */
export function mapearNatureza(tipo: string | null | undefined): CategoriaNatureza {
  const t = (tipo ?? "").toLowerCase();
  if (t.startsWith("in") || t.includes("credit") || t.includes("receita")) return "ENTRADA";
  return "SAIDA";
}

const TIPOS_CONTATO: Record<string, ContatoTipo> = {
  customer: "CLIENTE",
  cliente: "CLIENTE",
  supplier: "FORNECEDOR",
  fornecedor: "FORNECEDOR",
  employee: "FUNCIONARIO",
  funcionario: "FUNCIONARIO",
  partner: "SOCIO",
  socio: "SOCIO",
};

export function mapearTipoContato(tipo: string | null | undefined): ContatoTipo {
  const t = (tipo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return TIPOS_CONTATO[t] ?? "FORNECEDOR";
}

/**
 * Sentido do agendamento. O Nibo usa "Credit"/"Debit" (e variações em
 * português). Crédito entra, então é conta a RECEBER.
 */
export function mapearTipoAgendamento(tipo: string | null | undefined): "RECEBER" | "PAGAR" {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("credit") || t.includes("receb") || t.includes("in")) return "RECEBER";
  return "PAGAR";
}

const TIPOS_CONTA: Record<string, string> = {
  checking: "CORRENTE",
  corrente: "CORRENTE",
  savings: "POUPANCA",
  poupanca: "POUPANCA",
  cash: "CAIXA",
  caixa: "CAIXA",
  investment: "APLICACAO",
  aplicacao: "APLICACAO",
};

export function mapearTipoConta(tipo: string | null | undefined): string {
  const t = (tipo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return TIPOS_CONTA[t] ?? "CORRENTE";
}

/** "2026-09-08T00:00:00" ou "2026-09-08" -> "2026-09-08". Nulo se não der. */
export function soData(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

export type ContaMapeada = {
  niboId: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: string;
  saldoInicial: number;
  dataSaldoInicial: string | null;
  ativo: boolean;
};

export function mapearConta(c: NiboConta): ContaMapeada {
  return {
    niboId: c.id,
    banco: c.name?.trim() || (c.bankNumber ? String(c.bankNumber) : "Conta sem nome"),
    // extrato_contas_bancarias exige agência e conta não-nulas; conta do tipo
    // caixa no Nibo não tem nenhuma das duas.
    agencia: c.bankAgency?.trim() || "-",
    conta: c.bankAccount?.trim() || "-",
    tipo: mapearTipoConta(c.type),
    saldoInicial: Number(c.openBalance ?? 0),
    dataSaldoInicial: soData(c.dateOfOpenBalance),
    ativo: !c.isArchived,
  };
}

export type CategoriaMapeada = {
  niboId: string;
  nome: string;
  grupo: CategoriaGrupo;
  natureza: CategoriaNatureza;
  grupoIncerto: boolean;
  grupoOriginal: string | null;
};

export function mapearCategoria(c: NiboCategoria): CategoriaMapeada {
  const { grupo, confiante } = mapearGrupo(c.group?.name);
  return {
    niboId: c.id,
    nome: c.name?.trim() || "Sem nome",
    grupo,
    natureza: mapearNatureza(c.type),
    grupoIncerto: !confiante,
    grupoOriginal: c.group?.name ?? null,
  };
}

export type ContatoMapeado = {
  niboId: string;
  nome: string;
  tipo: ContatoTipo;
  cpfCnpj: string | null;
  email: string | null;
};

export function mapearContato(c: NiboContato): ContatoMapeado {
  return {
    niboId: c.id,
    nome: c.name?.trim() || "Sem nome",
    tipo: mapearTipoContato(c.type),
    cpfCnpj: c.document?.number?.replace(/\D/g, "") || null,
    email: c.email?.trim() || null,
  };
}

export type AgendamentoMapeado = {
  niboId: string;
  tipo: "RECEBER" | "PAGAR";
  vencimento: string;
  previstoPara: string | null;
  descricao: string | null;
  valorBruto: number;
  jaPago: number;
  contatoNiboId: string | null;
  categorias: { niboId: string; valor: number }[];
  centrosCusto: { niboId: string; percentual: number | null; valor: number }[];
  problema: string | null;
};

/**
 * Traduz um agendamento. Devolve `problema` preenchido em vez de lançar: um
 * registro estranho não pode derrubar a migração inteira no meio, e a lista de
 * problemas é o relatório que o operador precisa ver no fim.
 */
export function mapearAgendamento(a: NiboAgendamento): AgendamentoMapeado {
  const vencimento = soData(a.dueDate) ?? soData(a.accrualDate) ?? soData(a.scheduleDate);
  const valorBruto = Math.abs(Number(a.value ?? 0));

  let problema: string | null = null;
  if (!vencimento) problema = "sem data de vencimento";
  else if (!(valorBruto > 0)) problema = "valor zero ou inválido";

  const categorias = (a.categories ?? [])
    .filter((c) => c.categoryId && Number(c.value) !== 0)
    .map((c) => ({ niboId: c.categoryId, valor: Math.abs(Number(c.value)) }));

  if (!problema && categorias.length === 0) {
    problema = "sem categoria — não entraria em nenhum relatório";
  }

  return {
    niboId: a.scheduleId,
    tipo: mapearTipoAgendamento(a.type),
    vencimento: vencimento ?? "",
    // No Nibo, scheduleDate é quando se espera pagar; dueDate é o vencimento
    // formal. Só vira previsto_para quando de fato diverge.
    previstoPara:
      soData(a.scheduleDate) && soData(a.scheduleDate) !== vencimento
        ? soData(a.scheduleDate)
        : null,
    descricao: a.description?.trim() || null,
    valorBruto,
    jaPago: Math.abs(Number(a.paidValue ?? 0)),
    contatoNiboId: a.stakeholder?.id ?? null,
    categorias,
    centrosCusto: (a.costCenters ?? [])
      .filter((c) => c.costCenterId && Number(c.value) !== 0)
      .map((c) => ({
        niboId: c.costCenterId,
        percentual: c.percent ?? null,
        valor: Math.abs(Number(c.value)),
      })),
    problema,
  };
}
