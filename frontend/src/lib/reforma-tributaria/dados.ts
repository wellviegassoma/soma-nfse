import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { competenciasRbt12, resolverRbt12 } from "@/lib/faturamento";
import { buscarAtividade } from "@/lib/simples-nacional-atividades";
import { sugerirAtividade } from "@/lib/lc116-sugestao-atividade";
import { REDUCAO_POR_CCLASSTRIB } from "@/lib/reforma-tributaria/parametros";
import type { EntradaSimulacao } from "@/lib/reforma-tributaria/motor";
import type { IssTipo, TaxRegime } from "@/lib/types";

// Base de cada cliente para o simulador: últimos 12 meses fechados de
// receita (notas + receita manual, mesma regra do RBT12 da Visão geral) e
// de folha, mais a configuração fiscal cadastrada. Sem histórico completo,
// projeta para 12 meses pelos meses que existem (igual ao RBT12).

export type BaseEmpresaReforma = {
  id: string;
  nome: string;
  codigoCliente: string | null;
  taxRegime: TaxRegime | null;
  receitaEstimada: boolean;
  mesesReceita: number;
  folhaInformada: boolean;
  cClassTrib: string | null;
  // De onde veio o Anexo III × V do Simples: cadastro (cliente do Simples),
  // atividade dos serviços, ou presumido sujeito ao Fator R (conservador).
  origemAnexo: "cadastro" | "servicos" | "presumido";
  entrada: EntradaSimulacao;
};

type DpsRow = {
  company_id: string;
  valor: number;
  status: string;
  data_competencia: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

type AgregadoRow = {
  company_id: string;
  competencia: string;
  faturamento: number;
  faturamento_hospitalar: number;
};

// Mesmos defaults usados no simulador quando a empresa não tem o dado.
export const ISS_PADRAO = 0.05;
export const CUSTOS_CREDITAVEIS_PADRAO = 0.05;
export const B2B_PADRAO = 0;

export async function carregarBasesReforma(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  opcoes: { companyId?: string; custosCreditaveisPct?: number; percentualB2b?: number } = {},
): Promise<BaseEmpresaReforma[]> {
  const competencia = mesCorrenteBrasilia(); // janela = 12 meses antes deste
  const meses12 = new Set(competenciasRbt12(competencia));

  let companiesQuery = supabase
    .from("companies")
    .select(
      "id, legal_name, trade_name, codigo_cliente, person_type, data_abertura, tax_regime, sujeito_fator_r, iss_aliquota_padrao, iss_tipo, iss_valor_fixo_profissional, iss_quantidade_profissionais",
    )
    .eq("ativa", true)
    .order("legal_name", { ascending: true });
  if (opcoes.companyId) companiesQuery = companiesQuery.eq("id", opcoes.companyId);

  const [{ data: companies }, dpsRows, folhas, { data: manuais }, { data: servicos }] = await Promise.all([
    companiesQuery,
    buscarTudoPaginado<DpsRow>((from, to) => {
      let q = supabase.from("dps").select("company_id, valor, status, data_competencia, nfse(status, access_key)");
      if (opcoes.companyId) q = q.eq("company_id", opcoes.companyId);
      return q.range(from, to);
    }),
    buscarTudoPaginado<{ company_id: string; competencia: string; valor: number; pro_labore: number | null; fgts: number | null }>(
      (from, to) => {
        let q = supabase.from("folha_mensal").select("company_id, competencia, valor, pro_labore, fgts");
        if (opcoes.companyId) q = q.eq("company_id", opcoes.companyId);
        return q.order("company_id").order("competencia").range(from, to);
      },
    ),
    (() => {
      let q = supabase.from("receita_mensal_manual").select("company_id, competencia, valor");
      if (opcoes.companyId) q = q.eq("company_id", opcoes.companyId);
      return q;
    })(),
    (() => {
      let q = supabase.from("services").select("company_id, ibscbs_cclasstrib, atividade_simples_nacional, national_tax_code").eq("active", true);
      if (opcoes.companyId) q = q.eq("company_id", opcoes.companyId);
      return q;
    })(),
  ]);

  // Chaves já cobertas por dps não entram de novo pela RPC (mesma dedup da Visão geral).
  const chavesDps: string[] = [];
  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue;
    const nfse = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    if (nfse[0]?.access_key) chavesDps.push(nfse[0].access_key);
  }
  const { data: agregado } = await supabase.rpc("dashboard_agregado_notas_distribuidas", {
    p_chaves_excluir: chavesDps,
  });

  const receita = new Map<string, Map<string, number>>();
  const hospitalar = new Map<string, Map<string, number>>();
  const somar = (alvo: Map<string, Map<string, number>>, id: string, mes: string, v: number) => {
    const m = alvo.get(id) ?? new Map<string, number>();
    m.set(mes, (m.get(mes) ?? 0) + v);
    alvo.set(id, m);
  };
  for (const r of (agregado ?? []) as AgregadoRow[]) {
    somar(receita, r.company_id, r.competencia, Number(r.faturamento));
    somar(hospitalar, r.company_id, r.competencia, Number(r.faturamento_hospitalar));
  }
  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue;
    const nfse = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    if (nfse.some((n) => n.status === "CANCELADA")) continue;
    somar(receita, nota.company_id, nota.data_competencia.slice(0, 7), Number(nota.valor));
  }
  const manual = new Map<string, Map<string, number>>();
  for (const r of manuais ?? []) somar(manual, r.company_id, r.competencia, Number(r.valor));

  const folhaPorEmpresa = new Map<string, { salarios: number; proLabore: number; fgts: number; meses: number }>();
  for (const f of folhas) {
    if (!meses12.has(f.competencia)) continue;
    const acc = folhaPorEmpresa.get(f.company_id) ?? { salarios: 0, proLabore: 0, fgts: 0, meses: 0 };
    acc.salarios += Number(f.valor);
    acc.proLabore += Number(f.pro_labore ?? 0);
    acc.fgts += Number(f.fgts ?? 0);
    acc.meses += 1;
    folhaPorEmpresa.set(f.company_id, acc);
  }

  // cClassTrib mais comum entre os serviços ativos da empresa.
  const classPorEmpresa = new Map<string, Map<string, number>>();
  // Tratamento no Simples pelos serviços (atividade cadastrada ou sugerida pelo LC 116).
  const tratamentos = new Map<string, Set<string>>();
  for (const s of servicos ?? []) {
    const atividade = s.atividade_simples_nacional
      ? buscarAtividade(s.atividade_simples_nacional)
      : sugerirAtividade(s.national_tax_code);
    if (atividade) {
      const t = tratamentos.get(s.company_id) ?? new Set<string>();
      t.add(atividade.tratamento);
      tratamentos.set(s.company_id, t);
    }
    if (!s.ibscbs_cclasstrib) continue;
    const m = classPorEmpresa.get(s.company_id) ?? new Map<string, number>();
    m.set(s.ibscbs_cclasstrib, (m.get(s.ibscbs_cclasstrib) ?? 0) + 1);
    classPorEmpresa.set(s.company_id, m);
  }

  // Carnê-leão (CPF) não tem regime de PJ para comparar.
  return (companies ?? []).filter((c) => c.person_type !== "PF").map((c) => {
    const porMes = receita.get(c.id);
    const porMesManual = manual.get(c.id);
    const mesesManuais = new Set(porMesManual?.keys() ?? []);
    const mesesComDados = new Set([...(porMes?.keys() ?? []), ...mesesManuais]);
    const receitaMes = (m: string) => (porMesManual?.has(m) ? porMesManual.get(m)! : (porMes?.get(m) ?? 0));
    const rb = resolverRbt12({
      competencia,
      receitaPorMes: receitaMes,
      mesesComDados,
      mesesManuais,
      dataAbertura: c.data_abertura,
    });
    const bruto = [...meses12].reduce((acc, m) => acc + receitaMes(m), 0);
    const escala = bruto > 0 ? rb.rbt12 / bruto : 1;
    const hosp = [...meses12].reduce((acc, m) => acc + (hospitalar.get(c.id)?.get(m) ?? 0), 0) * escala;

    const folha = folhaPorEmpresa.get(c.id);
    const escalaFolha = folha && folha.meses > 0 && folha.meses < 12 ? 12 / folha.meses : 1;

    const classes = classPorEmpresa.get(c.id);
    const cClassTrib = classes ? [...classes.entries()].sort((a, b) => b[1] - a[1])[0][0] : null;
    const reducao = cClassTrib ? (REDUCAO_POR_CCLASSTRIB[cClassTrib] ?? 0) : 0;

    // Cliente fora do Simples não tem sujeito_fator_r mantido no cadastro —
    // vale a atividade dos serviços; sem ela, assume Fator R (medicina,
    // profissões regulamentadas etc.), que é o caso conservador: não
    // recomenda Simples à toa por causa do Anexo III.
    const trat = tratamentos.get(c.id);
    let origemAnexo: BaseEmpresaReforma["origemAnexo"];
    let sujeitoFatorR: boolean;
    if (c.tax_regime === "SIMPLES_NACIONAL") {
      origemAnexo = "cadastro";
      sujeitoFatorR = Boolean(c.sujeito_fator_r);
    } else if (trat && trat.size > 0) {
      origemAnexo = "servicos";
      sujeitoFatorR = trat.has("FATOR_R");
    } else {
      origemAnexo = "presumido";
      sujeitoFatorR = true;
    }
    const anexoIV = c.tax_regime !== "SIMPLES_NACIONAL" && Boolean(trat?.has("ANEXO_IV_FIXO"));

    const issTipo = c.iss_tipo as IssTipo;
    const issFixoAnual =
      issTipo === "FIXO" && c.iss_valor_fixo_profissional != null && c.iss_quantidade_profissionais != null
        ? Number(c.iss_valor_fixo_profissional) * Number(c.iss_quantidade_profissionais) * 12
        : null;

    return {
      id: c.id,
      nome: c.trade_name || c.legal_name,
      codigoCliente: c.codigo_cliente,
      taxRegime: c.tax_regime as TaxRegime | null,
      receitaEstimada: rb.estimado,
      mesesReceita: rb.mesesDisponiveis,
      folhaInformada: Boolean(folha),
      cClassTrib,
      origemAnexo,
      entrada: {
        receitaAnual: rb.rbt12,
        receitaHospitalarAnual: Math.min(hosp, rb.rbt12),
        salariosAnual: (folha?.salarios ?? 0) * escalaFolha,
        proLaboreAnual: (folha?.proLabore ?? 0) * escalaFolha,
        fgtsAnual: (folha?.fgts ?? 0) * escalaFolha,
        sujeitoFatorR,
        anexoIV,
        aliquotaIss: c.iss_aliquota_padrao != null ? Number(c.iss_aliquota_padrao) : ISS_PADRAO,
        issFixoAnual,
        reducaoCbsIbs: reducao,
        custosCreditaveisPct: opcoes.custosCreditaveisPct ?? CUSTOS_CREDITAVEIS_PADRAO,
        percentualB2b: opcoes.percentualB2b ?? B2B_PADRAO,
      },
    };
  });
}
