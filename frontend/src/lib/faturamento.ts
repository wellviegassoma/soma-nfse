import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sugerirAtividade } from "@/lib/lc116-sugestao-atividade";

export type NotaFaturamento = {
  competencia: string; // "YYYY-MM"
  valor: number;
  cancelada: boolean;
};

type DpsRow = {
  valor: number;
  status: string;
  data_competencia: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

type NotaDistribuidaRow = {
  chave_acesso: string | null;
  valor_servico: number | null;
  competencia: string | null;
  cancelada: boolean;
  direcao: string;
};

// Mesma lógica de unificação/dedup do admin/page.tsx (Visão geral), mas
// já filtrada por empresa — uma nota emitida pelo próprio soma-nfse, uma
// vez sincronizada do Sefin Nacional, também aparece em
// notas_distribuidas (mesma chave_acesso), então precisa dedup.
export async function buscarFaturamentoMensal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<NotaFaturamento[]> {
  const [{ data: notas }, { data: distribuidas }] = await Promise.all([
    supabase
      .from("dps")
      .select("valor, status, data_competencia, nfse(status, access_key)")
      .eq("company_id", companyId),
    supabase
      .from("notas_distribuidas")
      .select("chave_acesso, valor_servico, competencia, cancelada, direcao")
      .eq("company_id", companyId)
      .eq("direcao", "saida"),
  ]);

  const vistos = new Set<string>();
  const unificadas: NotaFaturamento[] = [];

  for (const nota of (notas ?? []) as unknown as DpsRow[]) {
    if (nota.status !== "ACCEPTED") continue;
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    const cancelada = nfseArr.some((n) => n.status === "CANCELADA");
    if (chaveAcesso) vistos.add(chaveAcesso);
    unificadas.push({
      competencia: nota.data_competencia.slice(0, 7),
      valor: Number(nota.valor),
      cancelada,
    });
  }

  for (const nota of (distribuidas ?? []) as NotaDistribuidaRow[]) {
    if (nota.chave_acesso && vistos.has(nota.chave_acesso)) continue;
    if (nota.chave_acesso) vistos.add(nota.chave_acesso);
    unificadas.push({
      competencia: (nota.competencia ?? "").slice(0, 7),
      valor: Number(nota.valor_servico ?? 0),
      cancelada: nota.cancelada,
    });
  }

  return unificadas;
}

// Faturamento manual, informado mês a mês — normalmente pra competências
// anteriores à empresa existir no sistema (sem nota emitida/distribuída
// aqui), mas também serve como CORREÇÃO/override de um mês que já tem
// nota: a distribuição de notas do Sefin Nacional só passou a funcionar
// de forma confiável a partir de dezembro/2025, então meses reais
// anteriores a isso podem estar incompletos mesmo com nota "encontrada"
// no sistema. Quando informado, o manual sempre tem prioridade sobre o
// real (ver `receitaComManual`) — mesmo padrão de `buscarFolhaMensal`,
// mas pra receita.
export async function buscarReceitaManual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("receita_mensal_manual")
    .select("competencia, valor")
    .eq("company_id", companyId);
  return new Map((data ?? []).map((r) => [r.competencia as string, Number(r.valor)]));
}

export type NotaPorAtividade = {
  competencia: string; // "YYYY-MM"
  valor: number;
  cancelada: boolean;
  // Código de tributação nacional (LC 116) — chave de agrupamento. Nulo
  // quando a nota (normalmente distribuída, não cadastrada aqui) não tem
  // um serviço identificado.
  codigo: string | null;
  descricao: string;
  // Id de ATIVIDADES_SIMPLES_NACIONAL já resolvido — ver
  // resolverAtividadeNota pra a ordem de prioridade. Nulo = não dá pra
  // classificar (nem cadastro, nem sugestão automática cobrem o código).
  atividadeId: string | null;
  // true quando atividadeId veio só da sugestão automática por LC 116
  // (lc116-sugestao-atividade.ts), não de um serviço cadastrado com essa
  // classificação já confirmada — usado só pra sinalizar na UI que vale a
  // pena conferir.
  viaSugestao: boolean;
  // tpRetISSQN (services.tipo_retencao_issqn) — 1 = não retido, 2/3 =
  // retido pelo tomador/intermediário. Usado pra resolver o idAtividade
  // numérico do PGDAS-D (ver pgdas-declaracao.ts), que distingue atividade
  // com e sem retenção de ISS. Notas distribuídas sem serviço cadastrado
  // aqui não têm como saber isso — default 1 (não retido).
  tipoRetencaoIssqn: number;
};

// Resolve a atividade do Simples Nacional de uma nota que não está
// diretamente ligada a um `services` cadastrado (é o caso de toda nota em
// `notas_distribuidas` — emitida por fora do soma-nfse, sem
// service_id/FK nenhum). Ordem de prioridade:
//
// 1. A empresa já tem algum serviço cadastrado com esse MESMO código LC
//    116, e esse serviço já está classificado? Reaproveita — é
//    informação que o contador já confirmou, só que pra outro serviço.
// 2. Sugestão automática pelo código (sugerirAtividade) — só cobre os
//    códigos inequívocos já mapeados.
// 3. Não classificado — melhor deixar em branco do que chutar.
function resolverAtividadeNota(
  codigo: string | null,
  mapaServicosPorCodigo: Map<string, string>,
): { atividadeId: string | null; viaSugestao: boolean } {
  if (!codigo) return { atividadeId: null, viaSugestao: false };
  const doCadastro = mapaServicosPorCodigo.get(codigo);
  if (doCadastro) return { atividadeId: doCadastro, viaSugestao: false };
  const sugestao = sugerirAtividade(codigo);
  return { atividadeId: sugestao?.id ?? null, viaSugestao: Boolean(sugestao) };
}

// Mesma fonte/dedup de buscarFaturamentoMensal, mas preservando o serviço
// (dps.service_id -> services.national_tax_code/name/atividade_simples_nacional)
// ou, pra notas distribuídas sem cadastro de serviço aqui, o
// código/descrição que já vem na própria nota
// (codigo_trib_nacional/descricao_servico) — nesse caso a atividade é
// resolvida por resolverAtividadeNota. Visão preparatória pra segregar o
// faturamento por atividade do PGDAS-D — sem isso, TRANSDECLARACAO11 não
// dá pra montar (exige receita por atividade, não um total único).
export async function buscarFaturamentoPorAtividade(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<NotaPorAtividade[]> {
  type ServicoDaNota = {
    name: string;
    national_tax_code: string | null;
    atividade_simples_nacional: string | null;
    tipo_retencao_issqn: number;
  };
  type DpsComServicoRow = DpsRow & {
    services: ServicoDaNota | ServicoDaNota[] | null;
  };

  const [{ data: notas }, { data: distribuidas }, { data: todosServicos }] = await Promise.all([
    supabase
      .from("dps")
      .select(
        "valor, status, data_competencia, services(name, national_tax_code, atividade_simples_nacional, tipo_retencao_issqn), nfse(status, access_key)",
      )
      .eq("company_id", companyId),
    supabase
      .from("notas_distribuidas")
      .select(
        "chave_acesso, valor_servico, competencia, cancelada, direcao, codigo_trib_nacional, descricao_servico",
      )
      .eq("company_id", companyId)
      .eq("direcao", "saida"),
    supabase
      .from("services")
      .select("national_tax_code, atividade_simples_nacional")
      .eq("company_id", companyId)
      .not("national_tax_code", "is", null)
      .not("atividade_simples_nacional", "is", null),
  ]);

  // Código LC 116 -> atividade já classificada em QUALQUER serviço dessa
  // empresa (não só o serviço da nota em questão) — é o que permite
  // reaproveitar a classificação pra notas distribuídas sem cadastro
  // próprio, desde que o código bata com algo já classificado aqui.
  const mapaServicosPorCodigo = new Map<string, string>();
  for (const s of (todosServicos ?? []) as { national_tax_code: string; atividade_simples_nacional: string }[]) {
    if (!mapaServicosPorCodigo.has(s.national_tax_code)) {
      mapaServicosPorCodigo.set(s.national_tax_code, s.atividade_simples_nacional);
    }
  }

  const vistos = new Set<string>();
  const out: NotaPorAtividade[] = [];

  for (const nota of (notas ?? []) as unknown as DpsComServicoRow[]) {
    if (nota.status !== "ACCEPTED") continue;
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    const cancelada = nfseArr.some((n) => n.status === "CANCELADA");
    if (chaveAcesso) vistos.add(chaveAcesso);
    const servico = Array.isArray(nota.services) ? nota.services[0] : nota.services;
    // Nota ligada a um serviço cadastrado de verdade (service_id) — usa a
    // classificação DESSE serviço direto, sem precisar do fallback por
    // código (mais preciso: é o serviço exato da nota, não só "algum"
    // serviço com o mesmo código).
    const atividadeDoServico = servico?.atividade_simples_nacional ?? null;
    out.push({
      competencia: nota.data_competencia.slice(0, 7),
      valor: Number(nota.valor),
      cancelada,
      codigo: servico?.national_tax_code ?? null,
      descricao: servico?.name ?? "Serviço não identificado no cadastro",
      atividadeId: atividadeDoServico,
      viaSugestao: false,
      tipoRetencaoIssqn: servico?.tipo_retencao_issqn ?? 1,
    });
  }

  for (const nota of (distribuidas ?? []) as (NotaDistribuidaRow & {
    codigo_trib_nacional: string | null;
    descricao_servico: string | null;
  })[]) {
    if (nota.chave_acesso && vistos.has(nota.chave_acesso)) continue;
    if (nota.chave_acesso) vistos.add(nota.chave_acesso);
    const { atividadeId, viaSugestao } = resolverAtividadeNota(nota.codigo_trib_nacional, mapaServicosPorCodigo);
    out.push({
      competencia: (nota.competencia ?? "").slice(0, 7),
      valor: Number(nota.valor_servico ?? 0),
      cancelada: nota.cancelada,
      codigo: nota.codigo_trib_nacional,
      descricao: nota.descricao_servico ?? "Nota distribuída (sem serviço cadastrado)",
      atividadeId,
      viaSugestao,
      // Sem serviço próprio ligado, não há como saber a retenção de ISS
      // real dessa nota — assume não retido (o caso mais comum).
      tipoRetencaoIssqn: 1,
    });
  }

  return out;
}

export type AtividadeAgrupada = {
  chave: string;
  descricao: string;
  codigo: string | null;
  valor: number;
  atividadeId: string | null;
  viaSugestao: boolean;
};

// Agrupa pela classificação do Simples Nacional já resolvida (atividadeId
// — ver resolverAtividadeNota), não pelo código LC 116 bruto: é essa
// segregação (por Anexo III / Fator R / Anexo IV) que o PGDAS-D realmente
// exige, e vários códigos LC 116 diferentes podem cair no mesmo Anexo.
// Notas SEM classificação resolvida continuam agrupadas por código/
// descrição bruta da própria nota — nesse caso agrupar pela "não
// classificação" genérica esconderia justamente o que falta cadastrar.
export function agruparPorAtividade(notas: NotaPorAtividade[], competencia: string): AtividadeAgrupada[] {
  const mapa = new Map<string, AtividadeAgrupada>();
  for (const nota of notas) {
    if (nota.cancelada || nota.competencia !== competencia) continue;
    const chave = nota.atividadeId ? `ativ:${nota.atividadeId}` : `nc:${nota.codigo ?? `desc:${nota.descricao}`}`;
    const atual =
      mapa.get(chave) ??
      ({
        chave,
        descricao: nota.descricao,
        codigo: nota.codigo,
        valor: 0,
        atividadeId: nota.atividadeId,
        viaSugestao: nota.viaSugestao,
      } satisfies AtividadeAgrupada);
    atual.valor += nota.valor;
    // Se qualquer nota do grupo ainda depende só da sugestão automática
    // (não confirmada em nenhum cadastro), sinaliza o grupo inteiro —
    // mesmo que outra nota do mesmo grupo já tenha vindo confirmada.
    if (nota.viaSugestao) atual.viaSugestao = true;
    mapa.set(chave, atual);
  }
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor);
}

export function somarFaturamento(notas: NotaFaturamento[], competencias: string[]): number {
  const alvo = new Set(competencias);
  return notas
    .filter((n) => !n.cancelada && alvo.has(n.competencia))
    .reduce((acc, n) => acc + n.valor, 0);
}

// Combina o faturamento real (notas) com o manual (`buscarReceitaManual`)
// numa única fonte pra `resolverRbt12`: o manual, quando informado,
// SEMPRE tem prioridade sobre o real — normalmente preenche competências
// sem nenhuma nota, mas também serve pra corrigir um mês que já tem nota
// (útil pra competências anteriores a dezembro/2025, quando a
// distribuição de notas do Sefin Nacional ainda era parcial e pode ter
// ficado incompleta mesmo tendo "encontrado" alguma nota).
export function receitaComManual(
  notas: NotaFaturamento[],
  receitaManualPorMes: Map<string, number>,
): { receitaPorMes: (mes: string) => number; mesesComDados: Set<string>; mesesManuais: Set<string> } {
  const mesesComDadosReal = new Set(notas.filter((n) => !n.cancelada).map((n) => n.competencia));
  const mesesManuais = new Set(receitaManualPorMes.keys());
  const mesesComDados = new Set([...mesesComDadosReal, ...mesesManuais]);
  const receitaPorMes = (mes: string) =>
    receitaManualPorMes.has(mes) ? receitaManualPorMes.get(mes)! : somarFaturamento(notas, [mes]);
  return { receitaPorMes, mesesComDados, mesesManuais };
}

export type RetencaoPorMes = {
  competencia: string; // "YYYY-MM"
  irrf: number;
  // Soma de PIS+COFINS+CSLL retidos (vRetCSLL do layout nacional, código
  // de receita 5952/IN RFB 1234/2012) — vem sempre combinado, o layout
  // nacional não separa por tributo.
  contribuicoesSociais: number;
};

// Diferente de buscarFaturamentoMensal, não precisa dedup contra `dps`:
// a tabela de emissão própria não guarda retenção nenhuma (só
// notas_distribuidas tem, populada pela sincronização diária do Sefin
// Nacional — inclusive pras notas emitidas por este sistema, uma vez
// sincronizadas). Só considera notas de SAÍDA (a empresa é a prestadora
// — retenção sofrida pela empresa, não a que ela mesma fez como tomadora
// de terceiros).
export async function buscarRetencoesMensal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
): Promise<RetencaoPorMes[]> {
  const { data } = await supabase
    .from("notas_distribuidas")
    .select("competencia, valor_ret_irrf, valor_ret_csll, cancelada, direcao")
    .eq("company_id", companyId)
    .eq("direcao", "saida")
    .eq("cancelada", false);

  const porMes = new Map<string, RetencaoPorMes>();
  for (const n of (data ?? []) as {
    competencia: string | null;
    valor_ret_irrf: number | null;
    valor_ret_csll: number | null;
  }[]) {
    if (!n.competencia) continue;
    const competencia = n.competencia.slice(0, 7); // "YYYY-MM-DD" -> "YYYY-MM"
    const atual = porMes.get(competencia) ?? { competencia, irrf: 0, contribuicoesSociais: 0 };
    atual.irrf += n.valor_ret_irrf ?? 0;
    atual.contribuicoesSociais += n.valor_ret_csll ?? 0;
    porMes.set(competencia, atual);
  }
  return [...porMes.values()];
}

export function somarRetencoes(
  retencoes: RetencaoPorMes[],
  competencias: string[],
): { irrf: number; contribuicoesSociais: number } {
  const alvo = new Set(competencias);
  return retencoes
    .filter((r) => alvo.has(r.competencia))
    .reduce(
      (acc, r) => ({ irrf: acc.irrf + r.irrf, contribuicoesSociais: acc.contribuicoesSociais + r.contribuicoesSociais }),
      { irrf: 0, contribuicoesSociais: 0 },
    );
}

// "YYYY-MM" dos 12 meses ANTERIORES à competência informada (RBT12 nunca
// inclui o próprio mês de apuração — regra oficial do Simples Nacional).
export function competenciasRbt12(competenciaAlvo: string): string[] {
  const [ano, mes] = competenciaAlvo.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

// "YYYY-MM" dos 3 meses do trimestre civil ao qual a competência pertence
// (jan-mar, abr-jun, jul-set, out-dez) — usado no Lucro Presumido, que
// apura IRPJ/CSLL por trimestre.
export function competenciasTrimestre(competencia: string): string[] {
  const [ano, mes] = competencia.split("-").map(Number);
  const primeiroMes = Math.floor((mes - 1) / 3) * 3 + 1;
  return [0, 1, 2].map((i) => `${ano}-${String(primeiroMes + i).padStart(2, "0")}`);
}

// Diferença em meses entre duas competências "YYYY-MM" (b − a). Positivo
// quando b é depois de a.
function diferencaEmMeses(a: string, b: string): number {
  const [anoA, mesA] = a.split("-").map(Number);
  const [anoB, mesB] = b.split("-").map(Number);
  return (anoB - anoA) * 12 + (mesB - mesA);
}

export type Rbt12Resolvido = {
  rbt12: number;
  estimado: boolean;
  mesesDisponiveis: number;
  // quantos dos meses usados vieram de faturamento manual (não de nota
  // real) — só informativo, pra UI avisar quando o valor depende de
  // dado digitado à mão em vez de nota emitida.
  mesesManuais: number;
  // true = RBT12 é a projeção proporcional oficial (empresa com menos de
  // 12 meses de existência, não uma estimativa por falta de dado — ver
  // resolverRbt12).
  empresaNova: boolean;
};

// Resolve o RBT12 pra uma competência.
//
// Primeiro verifica se a empresa é realmente NOVA (menos de 12 meses de
// existência, pela data de abertura do CNPJ): nesse caso, a regra
// oficial do Simples Nacional é projetar proporcionalmente o
// faturamento real desde a abertura (RBT12 = média mensal × 12) — não é
// uma estimativa por falta de dado, é a fórmula certa por lei.
//
// Se a empresa NÃO é nova (data de abertura desconhecida, ou já tem 12+
// meses), soma o faturamento dos 12 meses anteriores — `receitaPorMes`
// já entrega, pra cada mês, o real (quando tem nota) ou o manual
// informado pra competências anteriores à empresa existir no sistema
// (quando não tem); ver `buscarReceitaManual`. Como cada mês entra na
// conta individualmente, a janela móvel rola sozinha por construção: no
// mês seguinte, o mês mais antigo sai e o novo entra, sem nenhum
// decaimento ou "competência de referência" — é só a soma dos últimos
// 12 meses, exatamente como a regra oficial pede. Se `mesesComDados`
// (real + manual) não cobrir os 12 meses, projeta proporcionalmente
// pelos meses que cobrir.
export function resolverRbt12(params: {
  competencia: string;
  receitaPorMes: (mes: string) => number;
  mesesComDados: Set<string>;
  mesesManuais?: Set<string>;
  dataAbertura: string | null; // "YYYY-MM-DD"
}): Rbt12Resolvido {
  const meses12 = competenciasRbt12(params.competencia); // mais recente primeiro

  if (params.dataAbertura) {
    const competenciaAbertura = params.dataAbertura.slice(0, 7);
    const mesesDeExistencia = Math.max(0, diferencaEmMeses(competenciaAbertura, params.competencia));
    if (mesesDeExistencia < 12) {
      if (mesesDeExistencia === 0) {
        // Abertura é no próprio mês da competência — não tem "mês
        // anterior" nenhum ainda; usa a receita do próprio mês como
        // única base disponível pra projeção.
        const receitaMes = params.receitaPorMes(params.competencia);
        return {
          rbt12: receitaMes * 12,
          estimado: true,
          mesesDisponiveis: 0,
          mesesManuais: 0,
          empresaNova: true,
        };
      }
      const mesesConsiderados = meses12.slice(0, mesesDeExistencia);
      const receitaDesdeAbertura = mesesConsiderados.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
      return {
        rbt12: (receitaDesdeAbertura / mesesDeExistencia) * 12,
        estimado: true,
        mesesDisponiveis: mesesDeExistencia,
        mesesManuais: 0,
        empresaNova: true,
      };
    }
  }

  const mesesDisponiveis = meses12.filter((m) => params.mesesComDados.has(m)).length;
  const mesesManuais = meses12.filter((m) => params.mesesManuais?.has(m)).length;
  const historicoInsuficiente = mesesDisponiveis < 12;
  const rbt12Bruto = meses12.reduce((acc, m) => acc + params.receitaPorMes(m), 0);
  const rbt12 =
    historicoInsuficiente && mesesDisponiveis > 0 ? (rbt12Bruto / mesesDisponiveis) * 12 : rbt12Bruto;

  return {
    rbt12,
    estimado: historicoInsuficiente,
    mesesDisponiveis,
    mesesManuais,
    empresaNova: false,
  };
}
