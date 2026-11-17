import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeBrasilia } from "@/lib/competencia";
import { ehDas, janelaDaCompetencia, lerPagamentos, type PagamentoFederal } from "@/lib/pagamentos-federais-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type DasPagamento = {
  status: "pago" | "nao_pago" | "erro";
  pagamentos: PagamentoFederal[];
  mensagem: string | null;
  verificadoEm: string;
};

/** Uma chamada (PAGAMENTOS71) por empresa e janela — o serviço guarda o resultado do dia. */
export async function consultarPagamentosFederais(
  cnpj: string,
  competencia: string,
): Promise<{ ok: true; pagamentos: PagamentoFederal[]; paginaCheia: boolean } | { ok: false; erro: string }> {
  const { dataInicial, dataFinal } = janelaDaCompetencia(competencia, hojeBrasilia());
  let r: Response;
  try {
    r = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${cnpj}/pagamentos?data_inicial=${dataInicial}&data_final=${dataFinal}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return { ok: false, erro: "Não foi possível falar com o Integra Contador agora." };
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, erro: corpo?.detail ?? `Integra Contador respondeu HTTP ${r.status}.` };
  const pagamentos = lerPagamentos(corpo?.resposta?.dados);
  return { ok: true, pagamentos, paginaCheia: pagamentos.length >= 100 };
}

/** O DAS da competência foi pago? Considera todos os DAS daquele período de apuração. */
export function situacaoDas(pagamentos: PagamentoFederal[], competencia: string): DasPagamento {
  const das = pagamentos.filter((p) => ehDas(p) && p.periodoApuracao === competencia);
  return {
    status: das.length ? "pago" : "nao_pago",
    pagamentos: das,
    mensagem: null,
    verificadoEm: new Date().toISOString(),
  };
}

export async function salvarDasPagamento(
  supabase: Supa,
  params: { companyId: string; competencia: string; resultado: DasPagamento; userId: string | null },
) {
  const { error } = await supabase.from("das_pagamentos").upsert(
    {
      company_id: params.companyId,
      competencia: params.competencia,
      status: params.resultado.status,
      dados: { pagamentos: params.resultado.pagamentos, mensagem: params.resultado.mensagem },
      verificado_em: params.resultado.verificadoEm,
      verificado_por: params.userId,
    },
    { onConflict: "company_id,competencia" },
  );
  if (error) console.error("das_pagamentos: falha ao salvar", error.message);
}

export async function buscarDasPagamentos(supabase: Supa, competencia: string): Promise<Map<string, DasPagamento>> {
  const { data, error } = await supabase
    .from("das_pagamentos")
    .select("company_id, status, dados, verificado_em")
    .eq("competencia", competencia);
  const mapa = new Map<string, DasPagamento>();
  if (error) return mapa; // migração ainda não aplicada
  for (const r of data ?? []) {
    const d = (r.dados ?? {}) as { pagamentos?: PagamentoFederal[]; mensagem?: string | null };
    mapa.set(r.company_id as string, {
      status: r.status as DasPagamento["status"],
      pagamentos: d.pagamentos ?? [],
      mensagem: d.mensagem ?? null,
      verificadoEm: r.verificado_em as string,
    });
  }
  return mapa;
}
