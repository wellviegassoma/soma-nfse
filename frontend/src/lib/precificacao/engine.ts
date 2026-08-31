/**
 * Motor de cálculo de custo/margem por procedimento. Funções puras (sem I/O)
 * — usadas tanto em Server Components quanto num Client Component para
 * simulação em tempo real enquanto o usuário edita o formulário.
 *
 * Corrige dois erros de fórmula encontrados na planilha manual que este
 * módulo substitui: a taxa de cartão precisa ser `preço × alíquota` (a
 * planilha subtraía a alíquota bruta, ex. 0,02, em vez do valor em R$), e o
 * imposto no cenário com desconto precisa incidir sobre o preço já
 * descontado (a planilha calculava sobre o preço cheio nos dois cenários).
 */

export type CustoFixoLinha = {
  valor_mensal: number;
  ativo: boolean;
};

export function calcularCustoFixoHora(
  custosFixos: CustoFixoLinha[],
  cargaHorariaMensal: number,
): number {
  if (!cargaHorariaMensal) return 0;
  const total = custosFixos
    .filter((c) => c.ativo)
    .reduce((soma, c) => soma + c.valor_mensal, 0);
  return total / cargaHorariaMensal;
}

export function calcularCustoPorUso(insumo: {
  valor_compra: number;
  quantidade_por_compra: number;
}): number {
  if (!insumo.quantidade_por_compra) return 0;
  return insumo.valor_compra / insumo.quantidade_por_compra;
}

export type ItemReceita = {
  quantidade: number;
  custoPorUso: number;
};

export function calcularCustoMaterial(itens: ItemReceita[]): number {
  return itens.reduce((soma, item) => soma + item.quantidade * item.custoPorUso, 0);
}

export type ProcedimentoCalculoInput = {
  tempoAtendimentoHoras: number;
  precoVenda: number;
  custoLaboratorio: number;
  honorarioProfissionalFixo: number;
  percentualRetrabalho: number; // fração, ex. 0.05
  itensReceita: ItemReceita[];
  custoFixoHora: number;
  aliquotaImposto: number; // fração
  taxaCartao: number; // fração
  desconto: number; // fração — 0 desliga a simulação com desconto
};

export type CenarioPreco = {
  precoVenda: number;
  impostoValor: number;
  taxaCartaoValor: number;
  receitaLiquida: number;
  margemPct: number;
};

export type ResultadoPrecificacao = {
  custoMaterial: number;
  custoFixoProcedimento: number;
  retrabalhoValor: number;
  custoTotal: number;
  cheio: CenarioPreco;
  comDesconto: CenarioPreco;
};

function calcularCenario(precoVenda: number, custoTotal: number, aliquotaImposto: number, taxaCartao: number): CenarioPreco {
  const impostoValor = precoVenda * aliquotaImposto;
  const taxaCartaoValor = precoVenda * taxaCartao;
  const receitaLiquida = precoVenda - impostoValor - custoTotal - taxaCartaoValor;
  const margemPct = precoVenda > 0 ? receitaLiquida / precoVenda : 0;
  return { precoVenda, impostoValor, taxaCartaoValor, receitaLiquida, margemPct };
}

export function calcularProcedimento(input: ProcedimentoCalculoInput): ResultadoPrecificacao {
  const custoMaterial = calcularCustoMaterial(input.itensReceita);
  const custoFixoProcedimento = input.tempoAtendimentoHoras * input.custoFixoHora;
  const retrabalhoValor =
    input.percentualRetrabalho * (custoMaterial + custoFixoProcedimento);
  const custoTotal =
    custoFixoProcedimento +
    custoMaterial +
    input.custoLaboratorio +
    retrabalhoValor +
    input.honorarioProfissionalFixo;

  const cheio = calcularCenario(input.precoVenda, custoTotal, input.aliquotaImposto, input.taxaCartao);
  const precoComDesconto = input.precoVenda * (1 - input.desconto);
  const comDesconto = calcularCenario(precoComDesconto, custoTotal, input.aliquotaImposto, input.taxaCartao);

  return { custoMaterial, custoFixoProcedimento, retrabalhoValor, custoTotal, cheio, comDesconto };
}
