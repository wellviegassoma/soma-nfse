import { buscarAtividade, type TratamentoAtividade } from "@/lib/simples-nacional-atividades";
import { competenciasRbt12, type NotaPorAtividade } from "@/lib/faturamento";

// Id numérico de atividade do PGDAS-D (TRANSDECLARACAO11) — domínio
// definido pela PRÓPRIA Serpro, não pela lei (diferente de
// simples-nacional-atividades.ts, que cita a LC 123). Fonte: página
// "Dados de domínio" da documentação oficial, seção "Prestação de
// serviços, exceto para o exterior" (conferida em 27/08/2026):
// https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-sn/pgdasd/dados_de_dominio/
//
// Cobre só o caso de 100% dos clientes atuais (clínicas — serviço
// prestado no mercado interno, no próprio município do estabelecimento).
// NÃO cobre: mercado externo, ISS devido a outro município, construção
// civil (subitens 7.02/7.05), transporte/comunicação — se um cliente
// futuro cair nesses casos, esse mapeamento precisa crescer antes de
// declarar pra ele.
const ID_ATIVIDADE_POR_TRATAMENTO_E_RETENCAO: Record<TratamentoAtividade, { semRetencao: number; comRetencao: number }> = {
  FATOR_R: { semRetencao: 11, comRetencao: 12 },
  ANEXO_III_FIXO: { semRetencao: 14, comRetencao: 15 },
  ANEXO_IV_FIXO: { semRetencao: 17, comRetencao: 18 },
};

function resolverIdAtividade(tratamento: TratamentoAtividade, tipoRetencaoIssqn: number): number {
  const retido = tipoRetencaoIssqn !== 1;
  const par = ID_ATIVIDADE_POR_TRATAMENTO_E_RETENCAO[tratamento];
  return retido ? par.comRetencao : par.semRetencao;
}

export type DeclaracaoPgdasResultado =
  | { dados: null; bloqueios: string[] }
  | { dados: Record<string, unknown>; bloqueios: [] };

// Monta o corpo do campo `dados` de PGDASD.TRANSDECLARACAO11 (ver
// apicenter.estaleiro.serpro.gov.br/.../pgdasd/servicos/entregar_declaracao_mensal_entrada/).
// Função pura — quem chama já buscou tudo no Supabase antes (ver
// declarar/route.ts). Bloqueia (não monta nada) se sobrar nota sem
// atividade resolvida na competência: declarar com receita faltando
// seria uma declaração errada de verdade, não uma aproximação aceitável.
export function montarDeclaracaoPgdasD(params: {
  cnpj: string;
  competencia: string; // "YYYY-MM"
  indicadorTransmissao: boolean;
  notas: NotaPorAtividade[];
  receitaPorMes: (mes: string) => number;
  folhaPorMes: (mes: string) => number | undefined;
}): DeclaracaoPgdasResultado {
  const { cnpj, competencia, indicadorTransmissao, notas, receitaPorMes, folhaPorMes } = params;
  const cnpjLimpo = cnpj.replace(/\D/g, "");
  const [ano, mes] = competencia.split("-").map(Number);
  const pa = ano * 100 + mes;

  const notasDoMes = notas.filter((n) => !n.cancelada && n.competencia === competencia);

  const naoClassificadas = notasDoMes.filter((n) => !n.atividadeId);
  if (naoClassificadas.length > 0) {
    const descricoes = Array.from(new Set(naoClassificadas.map((n) => n.descricao)));
    return {
      dados: null,
      bloqueios: descricoes.map(
        (d) => `"${d}" ainda não tem atividade do Simples Nacional classificada — resolva antes de declarar.`,
      ),
    };
  }

  // Agrupa por idAtividade final (tratamento × retenção de ISS) — cada
  // combinação vira uma entrada em `atividades[]`; sem segregação por
  // município (ver limitação em pgdas-declaracao.ts topo do arquivo).
  const valorPorIdAtividade = new Map<number, number>();
  for (const nota of notasDoMes) {
    const atividade = buscarAtividade(nota.atividadeId!);
    if (!atividade) continue; // já filtrado acima, guarda de tipo
    const idAtividade = resolverIdAtividade(atividade.tratamento, nota.tipoRetencaoIssqn);
    valorPorIdAtividade.set(idAtividade, (valorPorIdAtividade.get(idAtividade) ?? 0) + nota.valor);
  }

  const receitaTotal = notasDoMes.reduce((acc, n) => acc + n.valor, 0);

  const meses12 = competenciasRbt12(competencia); // mais recente primeiro, sem incluir o mês atual
  const receitasBrutasAnteriores = meses12.map((m) => {
    const [a, mm] = m.split("-").map(Number);
    return { pa: a * 100 + mm, valorInterno: receitaPorMes(m), valorExterno: 0 };
  });

  const folhasSalario = [...meses12, competencia]
    .map((m) => {
      const [a, mm] = m.split("-").map(Number);
      const valor = folhaPorMes(m);
      return valor === undefined ? null : { pa: a * 100 + mm, valor };
    })
    .filter((f): f is { pa: number; valor: number } => f !== null);

  return {
    dados: {
      cnpjCompleto: cnpjLimpo,
      pa,
      indicadorTransmissao,
      indicadorComparacao: false,
      declaracao: {
        tipoDeclaracao: 1, // original — ver limitação: sem retificadora automática
        receitaPaCompetenciaInterno: receitaTotal,
        receitaPaCompetenciaExterno: 0,
        receitasBrutasAnteriores,
        ...(folhasSalario.length > 0 ? { folhasSalario } : {}),
        estabelecimentos: [
          {
            cnpjCompleto: cnpjLimpo,
            atividades: Array.from(valorPorIdAtividade.entries()).map(([idAtividade, valor]) => ({
              idAtividade,
              valorAtividade: valor,
              receitasAtividade: [{ valor }],
            })),
          },
        ],
      },
    },
    bloqueios: [],
  };
}
