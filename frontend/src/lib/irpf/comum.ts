// Constantes e regras do módulo IRPF que valem no servidor e no navegador.
import type { ResumoDeclaracao } from "./dec-parser";
import type { StatusTone } from "@/lib/formatters";

/** Resumo como fica gravado em irpf_declaracoes.resumo (sem o CPF do titular). */
export type ResumoGravado = Omit<ResumoDeclaracao, "cpf" | "cadastro">;

export const STATUS_DECLARACAO = [
  "NAO_INICIADA",
  "AGUARDANDO_DOCUMENTOS",
  "DOCUMENTOS_RECEBIDOS",
  "EM_ELABORACAO",
  "EM_REVISAO",
  "AGUARDANDO_APROVACAO",
  "APROVADA",
  "TRANSMITIDA",
  "NAO_FARA",
] as const;
export type StatusDeclaracao = (typeof STATUS_DECLARACAO)[number];

export const STATUS_LABEL: Record<StatusDeclaracao, string> = {
  NAO_INICIADA: "Não iniciada",
  AGUARDANDO_DOCUMENTOS: "Aguardando documentos",
  DOCUMENTOS_RECEBIDOS: "Documentos recebidos",
  EM_ELABORACAO: "Em elaboração",
  EM_REVISAO: "Em revisão",
  AGUARDANDO_APROVACAO: "Aguardando aprovação do cliente",
  APROVADA: "Aprovada (pronta para transmitir)",
  TRANSMITIDA: "Transmitida (entregue)",
  NAO_FARA: "Não fará",
};

export const STATUS_TOM: Record<StatusDeclaracao, StatusTone> = {
  NAO_INICIADA: "neutral",
  AGUARDANDO_DOCUMENTOS: "warning",
  DOCUMENTOS_RECEBIDOS: "warning",
  EM_ELABORACAO: "warning",
  EM_REVISAO: "warning",
  AGUARDANDO_APROVACAO: "warning",
  APROVADA: "success",
  TRANSMITIDA: "success",
  NAO_FARA: "neutral",
};

/** Etapas do quadro, na ordem do fluxo ("Não fará" fica fora). */
export const ETAPAS_QUADRO = STATUS_DECLARACAO.filter((s) => s !== "NAO_FARA");

/** Etapas em que a bola está com o cliente. */
export const ETAPA_CLIENTE: Partial<Record<StatusDeclaracao, true>> = {
  AGUARDANDO_DOCUMENTOS: true,
  AGUARDANDO_APROVACAO: true,
};

export const HONORARIO_STATUS = ["A_COBRAR", "COBRADO", "PAGO", "ISENTO"] as const;
export type HonorarioStatus = (typeof HONORARIO_STATUS)[number];
export const HONORARIO_LABEL: Record<HonorarioStatus, string> = {
  A_COBRAR: "A cobrar",
  COBRADO: "Cobrado",
  PAGO: "Pago",
  ISENTO: "Isento / incluso",
};

export const FORMAS_PAGAMENTO = ["Pix", "Boleto", "Transferência", "Dinheiro", "Cartão"] as const;

/** Valor reajustado, arredondado para cima no múltiplo pedido (0 = centavos). */
export function valorReajustado(base: number, percentual: number, arredondar: number): number {
  const v = base * (1 + percentual / 100);
  if (!arredondar) return Math.round(v * 100) / 100;
  return Math.ceil(v / arredondar - 1e-9) * arredondar;
}

export const CHECKLIST_STATUS = ["PENDENTE", "RECEBIDO", "NAO_SE_APLICA"] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUS)[number];

export const RESULTADO_LABEL = { SEM_SALDO: "Sem saldo", PAGAR: "A pagar", RESTITUIR: "A restituir" } as const;

/** Prazo de entrega: último dia útil de maio do exercício (ajuste pela agenda depois). */
export function prazoEntrega(exercicio: number): string {
  const d = new Date(Date.UTC(exercicio, 4, 31));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Data sem horário (AAAA-MM-DD) como dd/mm/aaaa, sem conversão de fuso. */
export function dataBr(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10).split("-").reverse().join("/") : "";
}

/** Dias corridos de hoje até a data (AAAA-MM-DD), no fuso de Brasília. */
export function diasAte(dataIso: string): number {
  return Math.ceil((Date.parse(`${dataIso}T23:59:59-03:00`) - Date.now()) / 86_400_000);
}

/** Exercício em andamento: até junho, o do ano; depois, o próximo (preparação da temporada). */
export function exercicioAtual(hoje = new Date()): number {
  return hoje.getMonth() >= 6 ? hoje.getFullYear() + 1 : hoje.getFullYear();
}

// ------------------------------------------------------------- checklist

export type ItemChecklistSugerido = {
  categoria: string;
  descricao: string;
  origem: "PADRAO" | "ANO_ANTERIOR";
};

const PADRAO: ItemChecklistSugerido[] = [
  { categoria: "Cadastro", descricao: "Confirmar endereço, telefone, e-mail e ocupação", origem: "PADRAO" },
  { categoria: "Cadastro", descricao: "Dados bancários para restituição / débito das quotas", origem: "PADRAO" },
  { categoria: "Cadastro", descricao: "Dependentes: nome, CPF e data de nascimento (houve mudança?)", origem: "PADRAO" },
  { categoria: "Rendimentos", descricao: "Informes de rendimentos de bancos e corretoras", origem: "PADRAO" },
  { categoria: "Rendimentos", descricao: "Outros rendimentos (aluguéis, pensão, venda de bens, exterior)", origem: "PADRAO" },
  { categoria: "Deduções", descricao: "Recibos e notas de despesas médicas e odontológicas", origem: "PADRAO" },
  { categoria: "Deduções", descricao: "Informe do plano de saúde", origem: "PADRAO" },
  { categoria: "Deduções", descricao: "Comprovantes de despesas com instrução", origem: "PADRAO" },
  { categoria: "Bens e dívidas", descricao: "Compra ou venda de bens no ano (contrato, escritura, nota)", origem: "PADRAO" },
  { categoria: "Bens e dívidas", descricao: "Saldo de empréstimos e financiamentos em 31/12", origem: "PADRAO" },
];

const CODIGO_PAGAMENTO: Record<string, string> = {
  "01": "Instrução",
  "09": "Fonoaudiólogo",
  "10": "Médico",
  "11": "Dentista",
  "12": "Psicólogo",
  "13": "Fisioterapeuta",
  "14": "Terapeuta ocupacional",
  "21": "Hospital / clínica / laboratório",
  "26": "Plano de saúde",
  "36": "Previdência complementar",
  "37": "FUNPRESP",
};

export function descricaoPagamento(codigo: string): string {
  return CODIGO_PAGAMENTO[codigo] ?? `Pagamento código ${codigo}`;
}

/**
 * Checklist do novo exercício: itens padrão + um item por fonte pagadora,
 * plano de saúde/escola e financiamento que apareceram na declaração do
 * ano anterior ("o que teve no ano passado provavelmente se repete").
 */
export function sugerirChecklist(anterior: ResumoGravado | null): ItemChecklistSugerido[] {
  const itens = [...PADRAO];
  if (!anterior) return itens;
  const vistos = new Set<string>();
  const add = (categoria: string, descricao: string) => {
    const chave = `${categoria}|${descricao}`.toLowerCase();
    if (vistos.has(chave)) return;
    vistos.add(chave);
    itens.push({ categoria, descricao, origem: "ANO_ANTERIOR" });
  };
  for (const f of anterior.fontes) {
    if (f.nome) add("Rendimentos", `Informe de rendimentos — ${f.nome}`);
  }
  if (anterior.totais.carneLeao > 0 || anterior.totais.livroCaixa > 0) {
    add("Rendimentos", "Carnê-Leão / livro-caixa do ano (recebimentos de PF e despesas)");
  }
  for (const p of anterior.pagamentos) {
    if (["26", "01", "21"].includes(p.codigo) && p.beneficiario) {
      add("Deduções", `${descricaoPagamento(p.codigo)} — ${p.beneficiario}`);
    }
  }
  if (anterior.pagamentos.some((p) => ["09", "10", "11", "12", "13", "14"].includes(p.codigo))) {
    add("Deduções", "Recibos de profissionais de saúde (houve no ano anterior)");
  }
  if (anterior.pagamentos.some((p) => p.codigo === "36")) {
    add("Deduções", "Informe de previdência complementar (PGBL)");
  }
  for (const d of anterior.dividas) {
    if (d.valorAtual > 0) add("Bens e dívidas", `Saldo em 31/12 — ${resumirTexto(d.descricao)}`);
  }
  return itens;
}

export function resumirTexto(s: string, max = 70): string {
  const limpo = s.replace(/\s+/g, " ").trim();
  return limpo.length > max ? `${limpo.slice(0, max - 1)}…` : limpo;
}

// ------------------------------------------------------------- análise

export type Comparativo = {
  campo: string;
  anterior: number | null;
  atual: number;
};

export function linhasComparativo(atual: ResumoGravado, anterior: ResumoGravado | null): Comparativo[] {
  const a = atual.totais;
  const p = anterior?.totais ?? null;
  const linha = (campo: string, f: (t: ResumoDeclaracao["totais"]) => number): Comparativo => ({
    campo,
    anterior: p ? f(p) : null,
    atual: f(a),
  });
  return [
    linha("Rendimentos tributáveis", (t) => t.rendimentosTributaveis),
    linha("Rendimentos isentos", (t) => t.rendimentosIsentos),
    linha("Tributação exclusiva", (t) => t.rendimentosExclusivos),
    linha("Deduções / desconto", (t) => t.deducoes),
    linha("Imposto devido", (t) => t.impostoDevido),
    linha("Imposto pago / retido", (t) => t.impostoPago),
    linha("A restituir", (t) => t.impostoRestituir),
    linha("A pagar", (t) => t.impostoPagar),
    linha("Bens e direitos em 31/12", (t) => t.bensAtual),
    linha("Dívidas em 31/12", (t) => t.dividasAtual),
  ];
}

/**
 * Indicador simples de variação patrimonial a descoberto: o patrimônio
 * líquido não pode crescer mais do que a renda disponível do ano
 * (tributáveis + isentos + exclusivos − imposto devido). Não substitui a
 * análise de caixa completa (despesas de vida não estão no .DEC).
 */
export function alertaVariacaoPatrimonial(r: ResumoGravado): { excesso: number } | null {
  const t = r.totais;
  const variacao = t.bensAtual - t.dividasAtual - (t.bensAnterior - t.dividasAnterior);
  const renda = t.rendimentosTributaveis + t.rendimentosIsentos + t.rendimentosExclusivos - t.impostoDevido;
  const excesso = variacao - renda;
  return excesso > 1 ? { excesso } : null;
}

export const TIPO_CONTA_LABEL: Record<string, string> = {
  "1": "Conta corrente",
  "2": "Conta poupança",
  "3": "Conta pagamento",
  "4": "Pix (chave CPF)",
};

export const DEPENDENCIA_LABEL: Record<string, string> = {
  "11": "Cônjuge",
  "12": "Companheiro(a)",
  "21": "Filho(a)/enteado(a) até 21 anos",
  "22": "Filho(a)/enteado(a) universitário até 24 anos",
  "24": "Filho(a)/enteado(a) incapaz",
  "25": "Irmão, neto ou bisneto sem arrimo dos pais, até 21 anos",
  "26": "Irmão, neto ou bisneto universitário até 24 anos",
  "28": "Irmão, neto ou bisneto incapaz",
  "31": "Pais, avós e bisavós",
  "41": "Menor pobre com guarda judicial",
  "51": "Pessoa absolutamente incapaz (tutela/curatela)",
};

/** Colunas de irpf_contribuintes preenchidas a partir do .DEC. */
export function camposCadastro(r: ResumoDeclaracao) {
  const c = r.cadastro;
  return {
    tipo_logradouro: c.tipoLogradouro,
    logradouro: c.logradouro,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cep: c.cep,
    municipio: c.municipio,
    municipio_codigo_rfb: c.municipioCodigoRfb,
    uf: c.uf,
    celular: c.celular,
    telefone_fixo: c.telefoneFixo,
    titulo_eleitor: c.tituloEleitor,
    ocupacao_codigo: c.ocupacaoCodigo,
    natureza_ocupacao_codigo: c.naturezaOcupacaoCodigo,
    tem_conjuge: c.temConjuge,
    cpf_conjuge: c.cpfConjuge,
    banco: c.banco,
    agencia: c.agencia,
    conta: c.conta,
    conta_dv: c.contaDv,
    tipo_conta: c.tipoConta,
    doenca_grave: c.doencaGrave,
    cadastro_exercicio: r.exercicio,
  };
}

/** Resumo sem o CPF do titular nem o cadastro (eles ficam no contribuinte). */
export function resumoParaGravar(r: ResumoDeclaracao): ResumoGravado {
  const { cpf: _cpf, cadastro: _cad, ...resto } = r;
  void _cpf;
  void _cad;
  return resto;
}
