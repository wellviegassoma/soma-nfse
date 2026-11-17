import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type MunicipioIss = "rio" | "petropolis";
export type StatusPagamentoIss = "paga" | "parcial" | "aberta" | "nao_emitida" | "sem_guia" | "erro";

export type GuiaPagamento = {
  valor: number | null;
  vencimento?: string | null;
  validade?: string | null;
  documento?: string | null;
  identificador?: string | null;
  quitada_em?: string | null;
  pago_em?: string | null;
  origem?: string | null;
};

export type PagamentoIss = {
  status: StatusPagamentoIss;
  pagas: GuiaPagamento[];
  abertas: GuiaPagamento[];
  mensagem: string | null;
  verificadoEm: string;
};

export async function buscarPagamentosIss(
  supabase: Supa,
  municipio: MunicipioIss,
  competencia: string,
): Promise<Map<string, PagamentoIss>> {
  const { data, error } = await supabase
    .from("iss_pagamentos")
    .select("company_id, status, dados, mensagem, verificado_em")
    .eq("municipio", municipio)
    .eq("competencia", competencia);
  const mapa = new Map<string, PagamentoIss>();
  if (error) return mapa; // migração ainda não aplicada: tela segue sem a coluna
  for (const r of data ?? []) {
    const d = (r.dados ?? {}) as { pagas?: GuiaPagamento[]; abertas?: GuiaPagamento[] };
    mapa.set(r.company_id as string, {
      status: r.status as StatusPagamentoIss,
      pagas: d.pagas ?? [],
      abertas: d.abertas ?? [],
      mensagem: (r.mensagem as string | null) ?? null,
      verificadoEm: r.verificado_em as string,
    });
  }
  return mapa;
}

export async function salvarPagamentoIss(
  supabase: Supa,
  params: { companyId: string; competencia: string; municipio: MunicipioIss; resultado: PagamentoIss; userId: string | null },
): Promise<void> {
  const { error } = await supabase.from("iss_pagamentos").upsert(
    {
      company_id: params.companyId,
      competencia: params.competencia,
      municipio: params.municipio,
      status: params.resultado.status,
      dados: { pagas: params.resultado.pagas, abertas: params.resultado.abertas },
      mensagem: params.resultado.mensagem,
      verificado_em: params.resultado.verificadoEm,
      verificado_por: params.userId,
    },
    { onConflict: "company_id,competencia,municipio" },
  );
  if (error) console.error("iss_pagamentos: falha ao salvar", error.message);
}
