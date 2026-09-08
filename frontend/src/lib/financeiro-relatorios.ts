// Montagem dos relatórios do Financeiro. Funções puras de propósito: recebem
// as linhas já lidas do banco e devolvem a matriz pronta, sem tocar em
// Supabase. É o que permite testá-las isoladamente — a aritmética aqui é a
// parte que, se errar, ninguém percebe olhando a tela.

import type { CategoriaGrupo } from "@/lib/financeiro";

// ---------------------------------------------------------------------------
// Painel de acompanhamento (DRE gerencial)
// ---------------------------------------------------------------------------

export type RateioCategoria = {
  agendamentoId: string;
  categoriaId: string;
  valor: number;
};

export type AgendamentoResumo = {
  id: string;
  tipo: "RECEBER" | "PAGAR";
  vencimento: string; // YYYY-MM-DD
  valorBruto: number;
  status: string;
};

export type LancamentoResumo = {
  agendamentoId: string | null;
  data: string; // YYYY-MM-DD
  valor: number; // com sinal
};

export type CategoriaResumo = {
  id: string;
  nome: string;
  grupo: CategoriaGrupo;
};

export type LinhaPainel = {
  categoriaId: string;
  nome: string;
  grupo: CategoriaGrupo;
  porCompetencia: Record<string, number>;
  total: number;
};

export type Painel = {
  competencias: string[];
  grupos: {
    grupo: CategoriaGrupo;
    linhas: LinhaPainel[];
    porCompetencia: Record<string, number>;
    total: number;
  }[];
  totalPorCompetencia: Record<string, number>;
  total: number;
};

function competenciaDe(data: string): string {
  return data.slice(0, 7);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Regime de COMPETÊNCIA: o valor entra no mês do vencimento do agendamento,
 * tenha sido pago ou não. Cancelado fica de fora — não é obrigação nem receita.
 *
 * O sinal vem do tipo do agendamento (receber soma, pagar subtrai), e não da
 * natureza da categoria: é o tipo que diz o sentido real do dinheiro. Uma
 * categoria de natureza "entrada" usada num agendamento a pagar (retenção
 * retida, desconto obtido) continua sendo redução de saída.
 */
export function montarPainelCompetencia(
  agendamentos: AgendamentoResumo[],
  rateios: RateioCategoria[],
  categorias: CategoriaResumo[],
  competencias: string[],
): Painel {
  const porId = new Map(agendamentos.map((a) => [a.id, a]));
  const acumulado = new Map<string, Record<string, number>>();

  for (const r of rateios) {
    const ag = porId.get(r.agendamentoId);
    if (!ag || ag.status === "CANCELADO") continue;
    const comp = competenciaDe(ag.vencimento);
    if (!competencias.includes(comp)) continue;

    const sinal = ag.tipo === "RECEBER" ? 1 : -1;
    const atual = acumulado.get(r.categoriaId) ?? {};
    atual[comp] = round2((atual[comp] ?? 0) + sinal * Number(r.valor));
    acumulado.set(r.categoriaId, atual);
  }

  return montarMatriz(acumulado, categorias, competencias);
}

/**
 * Regime de CAIXA: o valor entra no mês em que o dinheiro se moveu.
 *
 * Baixa parcial é rateada entre as categorias do agendamento na mesma
 * proporção do rateio original — pagar metade de uma conta dividida entre duas
 * categorias tem de lançar metade em cada, não o total na primeira.
 *
 * Transferência entre contas não tem agendamento e fica de fora: mover dinheiro
 * do Itaú pro Bradesco não é receita nem despesa, e contar isso inflaria o
 * relatório nos dois lados.
 */
export function montarPainelCaixa(
  lancamentos: LancamentoResumo[],
  agendamentos: AgendamentoResumo[],
  rateios: RateioCategoria[],
  categorias: CategoriaResumo[],
  competencias: string[],
): Painel {
  const porId = new Map(agendamentos.map((a) => [a.id, a]));

  const rateiosPorAgendamento = new Map<string, RateioCategoria[]>();
  for (const r of rateios) {
    const lista = rateiosPorAgendamento.get(r.agendamentoId) ?? [];
    lista.push(r);
    rateiosPorAgendamento.set(r.agendamentoId, lista);
  }

  const acumulado = new Map<string, Record<string, number>>();

  for (const l of lancamentos) {
    if (!l.agendamentoId) continue; // perna de transferência
    const ag = porId.get(l.agendamentoId);
    if (!ag) continue;
    const comp = competenciaDe(l.data);
    if (!competencias.includes(comp)) continue;

    const doAgendamento = rateiosPorAgendamento.get(l.agendamentoId) ?? [];
    const somaRateio = doAgendamento.reduce((s, r) => s + Number(r.valor), 0);
    if (somaRateio <= 0) continue;

    // O lançamento já vem com sinal (negativo saiu), então basta distribuir.
    for (const r of doAgendamento) {
      const proporcao = Number(r.valor) / somaRateio;
      const atual = acumulado.get(r.categoriaId) ?? {};
      atual[comp] = round2((atual[comp] ?? 0) + Number(l.valor) * proporcao);
      acumulado.set(r.categoriaId, atual);
    }
  }

  return montarMatriz(acumulado, categorias, competencias);
}

const ORDEM_GRUPOS: CategoriaGrupo[] = [
  "RECEITA_OPERACIONAL",
  "CUSTO_DESPESA_OPERACIONAL",
  "INVESTIMENTO",
  "FINANCIAMENTO",
];

function montarMatriz(
  acumulado: Map<string, Record<string, number>>,
  categorias: CategoriaResumo[],
  competencias: string[],
): Painel {
  const porCategoria = new Map(categorias.map((c) => [c.id, c]));

  const linhas: LinhaPainel[] = [];
  for (const [categoriaId, porCompetencia] of acumulado) {
    const cat = porCategoria.get(categoriaId);
    if (!cat) continue;
    const total = round2(
      competencias.reduce((s, c) => s + (porCompetencia[c] ?? 0), 0),
    );
    // Categoria que não movimentou em nenhum mês do período só polui a tela.
    if (total === 0 && competencias.every((c) => !porCompetencia[c])) continue;
    linhas.push({ categoriaId, nome: cat.nome, grupo: cat.grupo, porCompetencia, total });
  }

  const grupos = ORDEM_GRUPOS.map((grupo) => {
    const doGrupo = linhas
      .filter((l) => l.grupo === grupo)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    const porCompetencia: Record<string, number> = {};
    for (const c of competencias) {
      porCompetencia[c] = round2(
        doGrupo.reduce((s, l) => s + (l.porCompetencia[c] ?? 0), 0),
      );
    }
    const total = round2(doGrupo.reduce((s, l) => s + l.total, 0));
    return { grupo, linhas: doGrupo, porCompetencia, total };
  }).filter((g) => g.linhas.length > 0);

  const totalPorCompetencia: Record<string, number> = {};
  for (const c of competencias) {
    totalPorCompetencia[c] = round2(
      grupos.reduce((s, g) => s + (g.porCompetencia[c] ?? 0), 0),
    );
  }

  return {
    competencias,
    grupos,
    totalPorCompetencia,
    total: round2(grupos.reduce((s, g) => s + g.total, 0)),
  };
}

// ---------------------------------------------------------------------------
// Fluxo de caixa projetado
// ---------------------------------------------------------------------------

export type AgendamentoAberto = {
  tipo: "RECEBER" | "PAGAR";
  vencimento: string;
  previstoPara: string | null;
  emAberto: number; // sempre positivo
};

export type PontoFluxo = {
  competencia: string;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  /** Projetado = ainda não aconteceu; passa a ser previsão, não fato. */
  projetado: boolean;
};

/**
 * Projeta o saldo mês a mês a partir do saldo atual das contas.
 *
 * Usa `previsto_para` quando existe, senão o vencimento — é a diferença entre
 * "quando a obrigação vence" e "quando eu realmente espero pagar", e é o
 * segundo que interessa pra saber se o caixa aguenta.
 *
 * Conta vencida e ainda em aberto não é jogada fora nem espalhada: entra
 * inteira no primeiro mês da projeção. Ela vai ser paga, e fingir que não
 * existe é o jeito mais fácil de projetar um caixa que não existe.
 */
export function projetarFluxoCaixa(
  saldoAtual: number,
  abertos: AgendamentoAberto[],
  competencias: string[],
  competenciaAtual: string,
): PontoFluxo[] {
  const entradas: Record<string, number> = {};
  const saidas: Record<string, number> = {};
  for (const c of competencias) {
    entradas[c] = 0;
    saidas[c] = 0;
  }

  const primeira = competencias[0];

  for (const a of abertos) {
    const dataEsperada = a.previstoPara ?? a.vencimento;
    let comp = competenciaDe(dataEsperada);
    // Vencido: cai na primeira competência da grade.
    if (comp < primeira) comp = primeira;
    if (!(comp in entradas)) continue; // além do horizonte mostrado

    if (a.tipo === "RECEBER") entradas[comp] = round2(entradas[comp] + a.emAberto);
    else saidas[comp] = round2(saidas[comp] + a.emAberto);
  }

  let saldo = saldoAtual;
  return competencias.map((c) => {
    saldo = round2(saldo + entradas[c] - saidas[c]);
    return {
      competencia: c,
      entradas: entradas[c],
      saidas: saidas[c],
      saldoFinal: saldo,
      projetado: c >= competenciaAtual,
    };
  });
}
