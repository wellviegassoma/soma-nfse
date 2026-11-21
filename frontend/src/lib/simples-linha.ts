import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type NotaFaturamento,
  type NotaPorAtividade,
  type RetencaoPorMes,
  buscarFaturamentoMensal,
  buscarFaturamentoPorAtividade,
  buscarReceitaManual,
  buscarRetencoesMensal,
  competenciasRbt12,
  montarFaturamentoMensal,
  montarFaturamentoPorAtividade,
  montarRetencoesMensal,
  receitaComManual,
  resolverRbt12,
  somarFaturamento,
  somarReceitaIssRetido, somarReceitaExportacao,
  somarRetencoes,
} from "@/lib/faturamento";
import { type FolhaMensal, buscarFolhaMensal, montarFolhaMensal, resolverFatorR, resolverFp12, totalFolhaComEncargos } from "@/lib/folha";
import { abaterRetencaoDoDas, calcularSimplesNacional } from "@/lib/calculo-impostos";
import { montarDeclaracaoPgdasD } from "@/lib/pgdas-declaracao";
import { buscarTudoPaginado, buscarTudoPaginadoParalelo } from "@/lib/supabase/paginacao";
import {
  assinaturaConferencia,
  conferirSimples,
  liberadoParaEnvio,
  type EntradaConferencia,
  type ResultadoConferencia,
} from "@/lib/simples-conferencia";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export const COLUNAS_EMPRESA_SIMPLES =
  "id, legal_name, trade_name, codigo_cliente, cnpj, data_abertura, sujeito_fator_r, municipality_ibge_code";

export type EmpresaSimples = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  cnpj: string | null;
  data_abertura: string | null;
  sujeito_fator_r: boolean;
  municipality_ibge_code: string | null;
};

export type ConferenciaPrefeituraLinha = { valor: number | null; erro: string | null; consultadoEm: string } | null;
export type AprovacaoConferencia = {
  assinatura: string;
  aprovadoEm: string;
  aprovadoPorNome: string | null;
  observacao: string | null;
};

export type CalculoSimples = {
  receitaMes: number;
  // Parte de receitaMes que é exportação de serviço (mercado externo).
  receitaExportacao: number;
  rbt12: number;
  rbt12Estimado: boolean;
  anexo: string;
  aliquotaEfetiva: number;
  fatorR: number | null;
  retencaoIrrf: number;
  retencaoFederal: number;
  dasBruto: number;
  dasLiquido: number;
  bloqueios: string[];
  conferencia: ResultadoConferencia;
  assinatura: string;
  liberado: boolean;
};

export type DadosSimplesEmpresa = {
  notasMensais: NotaFaturamento[];
  notasPorAtividade: NotaPorAtividade[];
  receitaManualPorMes: Map<string, number>;
  folhaMensal: FolhaMensal[];
  retencoes: RetencaoPorMes[];
};

async function buscarDadosSimplesEmpresa(supabase: Supa, companyId: string): Promise<DadosSimplesEmpresa> {
  const [notasMensais, notasPorAtividade, receitaManualPorMes, folhaMensal, retencoes] = await Promise.all([
    buscarFaturamentoMensal(supabase, companyId),
    buscarFaturamentoPorAtividade(supabase, companyId),
    buscarReceitaManual(supabase, companyId),
    buscarFolhaMensal(supabase, companyId),
    buscarRetencoesMensal(supabase, companyId),
  ]);
  return { notasMensais, notasPorAtividade, receitaManualPorMes, folhaMensal, retencoes };
}

// Quantas empresas por consulta: a lista de ids vai na URL (filtro "in"),
// e lotes pequenos deixam as páginas de 1000 linhas correrem em paralelo.
const EMPRESAS_POR_LOTE = 10;

function agruparPorEmpresa<T extends { company_id: string }>(linhas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const l of linhas) {
    const lista = mapa.get(l.company_id);
    if (lista) lista.push(l);
    else mapa.set(l.company_id, [l]);
  }
  return mapa;
}

// Mesmos dados de buscarDadosSimplesEmpresa, mas para várias empresas de
// uma vez: uma consulta por tabela (em lotes de ids) em vez de ~10 por
// empresa. A Central do Simples com 160+ empresas fazia ~1.600 consultas
// e trazia as notas distribuídas duas vezes (9 s pra abrir). O resultado
// por empresa passa pelas mesmas funções montar* do caminho por empresa,
// então os números são idênticos.
export async function carregarDadosSimplesLote(
  supabase: Supa,
  companyIds: string[],
): Promise<Map<string, DadosSimplesEmpresa>> {
  type LinhaDps = { company_id: string };
  type LinhaDistribuida = { company_id: string; cancelada: boolean };
  type LinhaServico = { company_id: string };
  type LinhaManual = { company_id: string; competencia: string; valor: unknown };
  type LinhaFolha = { company_id: string; competencia: string; valor: unknown; pro_labore: unknown; fgts: unknown };

  const lotes: string[][] = [];
  for (let i = 0; i < companyIds.length; i += EMPRESAS_POR_LOTE) {
    lotes.push(companyIds.slice(i, i + EMPRESAS_POR_LOTE));
  }

  const porLote = await Promise.all(
    lotes.map((ids) =>
      Promise.all([
        // Colunas de buscarFaturamentoMensal + buscarFaturamentoPorAtividade juntas.
        buscarTudoPaginadoParalelo<LinhaDps>((from, to, contar) =>
          supabase
            .from("dps")
            .select("company_id, valor, status, data_competencia, nfse(status, access_key), services(name, national_tax_code, atividade_simples_nacional, tipo_retencao_issqn)", contar ? { count: "exact" } : undefined)
            .in("company_id", ids)
            .order("id")
            .range(from, to),
        ),
        // Colunas de faturamento, por atividade e retenções juntas: uma
        // leitura só das notas de saída.
        buscarTudoPaginadoParalelo<LinhaDistribuida>((from, to, contar) =>
          supabase
            .from("notas_distribuidas")
            .select("company_id, chave_acesso, valor_servico, competencia, cancelada, direcao, equiparacao_hospitalar, tipo_retencao_issqn, exportacao, codigo_trib_nacional, descricao_servico, valor_ret_irrf, valor_ret_csll", contar ? { count: "exact" } : undefined)
            .in("company_id", ids)
            .eq("direcao", "saida")
            .order("id")
            .range(from, to),
        ),
        buscarTudoPaginado<LinhaServico>((from, to) =>
          supabase
            .from("services")
            .select("company_id, national_tax_code, atividade_simples_nacional")
            .in("company_id", ids)
            .not("national_tax_code", "is", null)
            .not("atividade_simples_nacional", "is", null)
            .order("id")
            .range(from, to),
        ),
        buscarTudoPaginado<LinhaManual>((from, to) =>
          supabase
            .from("receita_mensal_manual")
            .select("company_id, competencia, valor")
            .in("company_id", ids)
            .order("company_id")
            .order("competencia")
            .range(from, to),
        ),
        buscarTudoPaginado<LinhaFolha>((from, to) =>
          supabase
            .from("folha_mensal")
            .select("company_id, competencia, valor, pro_labore, fgts")
            .in("company_id", ids)
            .order("company_id")
            .order("competencia")
            .range(from, to),
        ),
      ]),
    ),
  );

  const dps = agruparPorEmpresa(porLote.flatMap((l) => l[0]));
  const distribuidas = agruparPorEmpresa(porLote.flatMap((l) => l[1]));
  const servicos = agruparPorEmpresa(porLote.flatMap((l) => l[2]));
  const manuais = agruparPorEmpresa(porLote.flatMap((l) => l[3]));
  const folhas = agruparPorEmpresa(porLote.flatMap((l) => l[4]));

  const resultado = new Map<string, DadosSimplesEmpresa>();
  for (const id of companyIds) {
    const notasDps = dps.get(id) ?? [];
    const notasDist = distribuidas.get(id) ?? [];
    resultado.set(id, {
      notasMensais: montarFaturamentoMensal(notasDps, notasDist),
      notasPorAtividade: montarFaturamentoPorAtividade(notasDps, notasDist, servicos.get(id) ?? []),
      receitaManualPorMes: new Map((manuais.get(id) ?? []).map((r) => [r.competencia, Number(r.valor)])),
      folhaMensal: montarFolhaMensal(folhas.get(id) ?? []),
      // buscarRetencoesMensal filtra cancelada=false no banco.
      retencoes: montarRetencoesMensal(notasDist.filter((n) => n.cancelada === false)),
    });
  }
  return resultado;
}

// Mesmo cálculo que a Central Simples Nacional sempre fez por empresa
// (antes inline em admin/fechamento/simples/page.tsx), agora num lugar só
// pra a rota de transmissão do PGDAS-D poder conferir exatamente os
// mesmos números antes de transmitir.
export async function calcularSimplesEmpresa(
  supabase: Supa,
  company: EmpresaSimples,
  competencia: string,
  extras: { prefeitura: ConferenciaPrefeituraLinha; aprovacao: AprovacaoConferencia | null },
  // Já carregados em lote (carregarDadosSimplesLote): a Central do Simples
  // passa; quem calcula uma empresa só (transmissão, aprovação) deixa
  // vazio e a função busca sozinha.
  dadosCarregados?: DadosSimplesEmpresa,
): Promise<CalculoSimples> {
  const { notasMensais, notasPorAtividade, receitaManualPorMes, folhaMensal, retencoes } =
    dadosCarregados ?? (await buscarDadosSimplesEmpresa(supabase, company.id));

  const { receitaPorMes, mesesComDados, mesesManuais } = receitaComManual(notasMensais, receitaManualPorMes);
  const { rbt12, estimado: rbt12Estimado } = resolverRbt12({
    competencia,
    receitaPorMes,
    mesesComDados,
    mesesManuais,
    dataAbertura: company.data_abertura,
  });

  const folhaPorMes = new Map(folhaMensal.map((f) => [f.competencia, totalFolhaComEncargos(f)]));
  let fatorRPercentual: number | null = null;
  let mesesFolhaInformados = 0;
  if (company.sujeito_fator_r) {
    const { fp12, mesesDisponiveis } = resolverFp12({
      competencia,
      folhaPorMes: (mes) => folhaPorMes.get(mes),
      mesesComDados: new Set(folhaPorMes.keys()),
    });
    mesesFolhaInformados = mesesDisponiveis;
    fatorRPercentual = resolverFatorR(fp12, rbt12);
  }

  const receitaMes = somarFaturamento(notasMensais, [competencia]);
  const resultado = calcularSimplesNacional({
    receitaMes,
    rbt12,
    rbt12Estimado,
    sujeitoFatorR: company.sujeito_fator_r,
    fatorRPercentual,
    receitaIssRetido: somarReceitaIssRetido(notasPorAtividade, competencia),
    receitaExportacao: somarReceitaExportacao(notasPorAtividade, [competencia]),
  });

  const retencaoMes = somarRetencoes(retencoes, [competencia]);
  const liquido = abaterRetencaoDoDas(resultado, retencaoMes);

  const declaracao = montarDeclaracaoPgdasD({
    cnpj: company.cnpj ?? "",
    competencia,
    indicadorTransmissao: false,
    tipoDeclaracao: 1,
    notas: notasPorAtividade,
    receitaPorMes,
    folhaPorMes: (mes) => folhaPorMes.get(mes),
    dataAbertura: company.data_abertura,
  });

  const anteriores = competenciasRbt12(competencia).filter((m) => mesesComDados.has(m));
  const entrada: EntradaConferencia = {
    competencia,
    receitaMes,
    receitasMesesAnteriores: anteriores.map((m) => receitaPorMes(m)),
    receitaAcumuladaAno: mesesDoAnoAte(competencia).reduce(
      (acc, m) => acc + (m === competencia ? receitaMes : receitaPorMes(m)),
      0,
    ),
    rbt12,
    rbt12Estimado,
    mesesDeExistencia: company.data_abertura
      ? diferencaEmMeses(company.data_abertura.slice(0, 7), competencia)
      : null,
    sujeitoFatorR: company.sujeito_fator_r,
    fatorR: fatorRPercentual,
    mesesFolhaInformados,
    anexo: resultado.anexo,
    bloqueiosDeclaracao: declaracao.bloqueios,
    municipioIbge: company.municipality_ibge_code,
    prefeitura: extras.prefeitura ? { valor: extras.prefeitura.valor, erro: extras.prefeitura.erro } : null,
    receitaExportacao: resultado.receitaExportacao,
    dasBruto: resultado.dasTotal,
    dasLiquido: liquido.dasTotal,
  };
  const conferencia = conferirSimples(entrada);
  const assinatura = assinaturaConferencia(entrada, conferencia);

  return {
    receitaMes,
    receitaExportacao: resultado.receitaExportacao,
    rbt12,
    rbt12Estimado,
    anexo: resultado.anexo,
    aliquotaEfetiva: resultado.aliquotaEfetiva,
    fatorR: fatorRPercentual,
    retencaoIrrf: retencaoMes.irrf,
    retencaoFederal: retencaoMes.contribuicoesSociais,
    dasBruto: resultado.dasTotal,
    dasLiquido: liquido.dasTotal,
    bloqueios: declaracao.bloqueios,
    conferencia,
    assinatura,
    liberado: liberadoParaEnvio(conferencia, assinatura, extras.aprovacao),
  };
}

// Carrega o que a conferência precisa de fora do cálculo (última consulta
// à Prefeitura e aprovação já dada) pra várias empresas de uma vez.
export async function buscarExtrasConferencia(
  supabase: Supa,
  competencia: string,
  companyIds?: string[],
): Promise<{
  prefeitura: Map<string, NonNullable<ConferenciaPrefeituraLinha>>;
  aprovacoes: Map<string, AprovacaoConferencia>;
}> {
  let qPrefeitura = supabase
    .from("conferencia_prefeitura")
    .select("company_id, valor_prefeitura, erro, consultado_em")
    .eq("competencia", competencia);
  let qAprovacoes = supabase
    .from("simples_conferencia_aprovacoes")
    .select("company_id, assinatura, aprovado_em, observacao, profiles(full_name)")
    .eq("competencia", competencia);
  if (companyIds) {
    qPrefeitura = qPrefeitura.in("company_id", companyIds);
    qAprovacoes = qAprovacoes.in("company_id", companyIds);
  }
  const [{ data: conferencias, error: e1 }, { data: aprovacoes, error: e2 }] = await Promise.all([
    qPrefeitura,
    qAprovacoes,
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  return {
    prefeitura: new Map(
      (conferencias ?? []).map((c) => [
        c.company_id as string,
        {
          valor: c.valor_prefeitura == null ? null : Number(c.valor_prefeitura),
          erro: (c.erro as string | null) ?? null,
          consultadoEm: c.consultado_em as string,
        },
      ]),
    ),
    aprovacoes: new Map(
      (aprovacoes ?? []).map((a) => {
        const perfil = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles;
        return [
          a.company_id as string,
          {
            assinatura: a.assinatura as string,
            aprovadoEm: a.aprovado_em as string,
            aprovadoPorNome: (perfil as { full_name?: string | null } | null)?.full_name ?? null,
            observacao: (a.observacao as string | null) ?? null,
          },
        ];
      }),
    ),
  };
}

function mesesDoAnoAte(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number);
  return Array.from({ length: mes }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

function diferencaEmMeses(a: string, b: string): number {
  const [anoA, mesA] = a.split("-").map(Number);
  const [anoB, mesB] = b.split("-").map(Number);
  return Math.max(0, (anoB - anoA) * 12 + (mesB - mesA));
}
