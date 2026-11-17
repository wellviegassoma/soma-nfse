import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { proximaCompetencia } from "@/lib/competencia";
import {
  eventosDaNota,
  lerRetencoes,
  prestadorPessoaFisica,
  round2,
  sugerirNatureza,
  type EventoReinf,
  type ValoresRetidos,
} from "@/lib/reinf-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type StatusReinf = "pendente" | "enviado" | "dispensado";

export type NotaReinf = {
  id: string;
  companyId: string;
  numero: string | null;
  dataEmissao: string | null;
  /** Competência da nota ("YYYY-MM"). */
  competencia: string;
  /** Mês do pagamento ajustado pela equipe (vale para R-4010/R-4020). */
  mesPagamento: string | null;
  prestadorDocumento: string | null;
  prestadorNome: string | null;
  descricao: string | null;
  cTribNac: string | null;
  valorServico: number;
  /** Só os valores que caem no mês da Central (sem os de nota ignorada). */
  valores: ValoresRetidos;
  total: number;
  eventos: EventoReinf[];
  natureza: string | null;
  naturezaSugerida: string | null;
  ignorar: boolean;
  /** Parte dos valores foi para outro mês (pagamento em mês diferente). */
  parcialNoMes: boolean;
  alertas: string[];
};

export type EmpresaReinf = {
  companyId: string;
  nome: string;
  razaoSocial: string;
  cnpj: string | null;
  regime: string | null;
  notas: NotaReinf[];
  valorServico: number;
  valores: ValoresRetidos;
  total: number;
  /** Eventos da Reinf que a empresa tem no mês (sem o ISS, que é municipal). */
  eventos: EventoReinf[];
  temIss: boolean;
  status: StatusReinf | null;
  observacao: string | null;
  marcadoEm: string | null;
  alertas: number;
};

const ZERO: ValoresRetidos = { irrf: 0, pis: 0, cofins: 0, csll: 0, cp: 0, iss: 0 };

function somar(a: ValoresRetidos, b: Partial<ValoresRetidos>): ValoresRetidos {
  const r = { ...a };
  for (const k of Object.keys(b) as (keyof ValoresRetidos)[]) r[k] = round2(r[k] + (b[k] ?? 0));
  return r;
}

const COLUNAS_NOTA =
  "id, company_id, numero, data_emissao, competencia, prestador_cnpj, prestador_nome, descricao_servico, valor_servico, xml";

type LinhaNota = {
  id: string;
  company_id: string;
  numero: string | null;
  data_emissao: string | null;
  competencia: string | null;
  prestador_cnpj: string | null;
  prestador_nome: string | null;
  descricao_servico: string | null;
  valor_servico: number | null;
  xml: string;
};

type Ajuste = { nota_id: string; natureza: string | null; mes_pagamento: string | null; ignorar: boolean };

/**
 * Notas recebidas com retenção que caem na competência: as da própria
 * competência + as de outros meses que a equipe marcou como pagas nela.
 * R-4010/R-4020 seguem o mês do pagamento (ajuste); R-2010 e ISS ficam na
 * competência da nota.
 */
export async function carregarCentralReinf(
  supabase: Supa,
  competencia: string,
  opcoes: { companyIds?: string[] } = {},
): Promise<{ empresas: EmpresaReinf[]; migracaoPendente: boolean }> {
  const inicio = `${competencia}-01`;
  const fim = `${proximaCompetencia(competencia)}-01`;

  let q = supabase
    .from("notas_distribuidas")
    .select(COLUNAS_NOTA)
    .eq("direcao", "entrada")
    .eq("cancelada", false)
    .eq("tem_retencao", true)
    .gte("competencia", inicio)
    .lt("competencia", fim)
    .limit(5000);
  if (opcoes.companyIds?.length) q = q.in("company_id", opcoes.companyIds);
  const { data: doMes, error } = await q;
  if (error) {
    // Coluna/tabelas da fase BN ainda não aplicadas.
    if (/tem_retencao|reinf_/.test(error.message)) return { empresas: [], migracaoPendente: true };
    throw new Error(error.message);
  }

  const { data: pagosNoMes } = await supabase
    .from("reinf_notas_ajustes")
    .select("nota_id")
    .eq("mes_pagamento", competencia);
  const jaTem = new Set((doMes ?? []).map((n) => n.id as string));
  const deOutrosMeses = (pagosNoMes ?? []).map((a) => a.nota_id as string).filter((id) => !jaTem.has(id));
  let extras: LinhaNota[] = [];
  if (deOutrosMeses.length) {
    let q2 = supabase.from("notas_distribuidas").select(COLUNAS_NOTA).in("id", deOutrosMeses).eq("cancelada", false);
    if (opcoes.companyIds?.length) q2 = q2.in("company_id", opcoes.companyIds);
    extras = ((await q2).data ?? []) as LinhaNota[];
  }
  const linhas = [...((doMes ?? []) as LinhaNota[]), ...extras];
  if (!linhas.length) return { empresas: [], migracaoPendente: false };

  const ids = linhas.map((n) => n.id);
  const ajustes = new Map<string, Ajuste>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase
      .from("reinf_notas_ajustes")
      .select("nota_id, natureza, mes_pagamento, ignorar")
      .in("nota_id", ids.slice(i, i + 300));
    for (const a of (data ?? []) as Ajuste[]) ajustes.set(a.nota_id, a);
  }

  const companyIds = [...new Set(linhas.map((n) => n.company_id))];
  const [{ data: companies }, { data: fechamentos }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name, codigo_cliente, cnpj, tax_regime").in("id", companyIds),
    supabase
      .from("reinf_fechamentos")
      .select("company_id, status, observacao, marcado_em")
      .eq("competencia", competencia)
      .in("company_id", companyIds),
  ]);
  const fechPorEmpresa = new Map((fechamentos ?? []).map((f) => [f.company_id as string, f]));

  const notasPorEmpresa = new Map<string, NotaReinf[]>();
  for (const n of linhas) {
    const leitura = lerRetencoes(n.xml);
    if (leitura.total <= 0) continue;
    const ajuste = ajustes.get(n.id);
    const compNota = (n.competencia ?? "").slice(0, 7);
    const mesR4000 = ajuste?.mes_pagamento ?? compNota;
    const pf = prestadorPessoaFisica(n.prestador_cnpj);

    let valores: ValoresRetidos = { ...ZERO };
    const eventos: EventoReinf[] = [];
    let parcial = false;
    for (const e of eventosDaNota(leitura.valores, pf)) {
      const mesDoEvento = e.evento === "R-4020" || e.evento === "R-4010" ? mesR4000 : compNota;
      if (mesDoEvento !== competencia) {
        parcial = true;
        continue;
      }
      eventos.push(e.evento);
      valores = somar(valores, e.valores);
    }
    if (!eventos.length) continue;

    const temR4000 = eventos.includes("R-4020") || eventos.includes("R-4010");
    const naturezaSugerida = temR4000 ? sugerirNatureza(leitura.cTribNac, n.descricao_servico, pf) : null;
    const nota: NotaReinf = {
      id: n.id,
      companyId: n.company_id,
      numero: n.numero,
      dataEmissao: n.data_emissao,
      competencia: compNota,
      mesPagamento: ajuste?.mes_pagamento ?? null,
      prestadorDocumento: n.prestador_cnpj,
      prestadorNome: n.prestador_nome,
      descricao: n.descricao_servico,
      cTribNac: leitura.cTribNac,
      valorServico: Number(n.valor_servico ?? leitura.valorServico) || 0,
      valores,
      total: round2(Object.values(valores).reduce((a, b) => a + b, 0)),
      eventos,
      natureza: temR4000 ? (ajuste?.natureza ?? naturezaSugerida) : null,
      naturezaSugerida,
      ignorar: ajuste?.ignorar ?? false,
      parcialNoMes: parcial,
      alertas: leitura.alertas,
    };
    notasPorEmpresa.set(n.company_id, [...(notasPorEmpresa.get(n.company_id) ?? []), nota]);
  }

  const empresas: EmpresaReinf[] = [];
  for (const c of companies ?? []) {
    const notas = (notasPorEmpresa.get(c.id) ?? []).sort((a, b) => (a.dataEmissao ?? "").localeCompare(b.dataEmissao ?? ""));
    if (!notas.length) continue;
    const validas = notas.filter((n) => !n.ignorar);
    const valores = validas.reduce((acc, n) => somar(acc, n.valores), { ...ZERO });
    const eventosSet = new Set(validas.flatMap((n) => n.eventos));
    const eventos = (["R-2010", "R-4010", "R-4020"] as EventoReinf[]).filter((e) => eventosSet.has(e));
    const f = fechPorEmpresa.get(c.id);
    empresas.push({
      companyId: c.id,
      nome: `${c.codigo_cliente ? `#${c.codigo_cliente} ` : ""}${c.trade_name || c.legal_name}`,
      razaoSocial: c.legal_name,
      cnpj: c.cnpj,
      regime: c.tax_regime,
      notas,
      valorServico: round2(validas.reduce((a, n) => a + n.valorServico, 0)),
      valores,
      total: round2(Object.values(valores).reduce((a, b) => a + b, 0)),
      eventos,
      temIss: eventosSet.has("ISS"),
      status: (f?.status as StatusReinf | undefined) ?? (eventos.length ? "pendente" : null),
      observacao: (f?.observacao as string | null) ?? null,
      marcadoEm: (f?.marcado_em as string | null) ?? null,
      alertas: validas.reduce((a, n) => a + n.alertas.length, 0),
    });
  }
  empresas.sort((a, b) => a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR"));
  return { empresas, migracaoPendente: false };
}

export function totaisReinf(empresas: EmpresaReinf[]) {
  const valores = empresas.reduce((acc, e) => somar(acc, e.valores), { ...ZERO });
  const porEvento: Record<EventoReinf, { empresas: number; notas: number; total: number }> = {
    "R-4020": { empresas: 0, notas: 0, total: 0 },
    "R-4010": { empresas: 0, notas: 0, total: 0 },
    "R-2010": { empresas: 0, notas: 0, total: 0 },
    ISS: { empresas: 0, notas: 0, total: 0 },
  };
  for (const e of empresas) {
    const vistos = new Set<EventoReinf>();
    for (const n of e.notas) {
      if (n.ignorar) continue;
      for (const ev of n.eventos) {
        porEvento[ev].notas++;
        vistos.add(ev);
        const v = n.valores;
        porEvento[ev].total = round2(
          porEvento[ev].total + (ev === "ISS" ? v.iss : ev === "R-2010" ? v.cp : v.irrf + v.pis + v.cofins + v.csll),
        );
      }
    }
    for (const ev of vistos) porEvento[ev].empresas++;
  }
  return {
    valores,
    total: round2(Object.values(valores).reduce((a, b) => a + b, 0)),
    notas: empresas.reduce((a, e) => a + e.notas.filter((n) => !n.ignorar).length, 0),
    valorServico: round2(empresas.reduce((a, e) => a + e.valorServico, 0)),
    porEvento,
  };
}
