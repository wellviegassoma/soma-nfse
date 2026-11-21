import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";

export type NotaRecente = {
  /** "sistema" = emitida aqui; "externa" = emitida em outro emissor (notas_distribuidas). */
  origem: "sistema" | "externa";
  id: string;
  data: string | null;
  numero?: string | null;
  tomadorNome: string;
  /** Tomador correspondente já cadastrado nesta empresa (pra copiar). */
  customerId?: string;
  serviceId?: string;
  valor: number;
  descricao: string;
  /** Link do DANFSe pra conferir antes de copiar. */
  pdfUrl: string;
};

export type PrefillEmissao = {
  /** Nota que está sendo repetida ("Emitir de novo"). */
  inicial?: { customerId: string; serviceId: string; amount: string; description: string };
  /** Tomadores mais usados nas últimas notas (até 6, do mais usado). */
  tomadoresFrequentes: string[];
  servicoMaisUsado?: string;
  /** Últimas notas da empresa — daqui e do emissor externo — pra copiar. */
  ultimasNotas: NotaRecente[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const RE_DOC_TOMADOR = /<toma>[\s\S]*?<(CNPJ|CPF)>(\d+)<\/\1>/;

const SELECT_DPS =
  "id, customer_id, service_id, valor, descricao, data_competencia, created_at, customer:customers(name), nfse(access_key)";
const SELECT_EXTERNA =
  "id, numero, chave_acesso, data_emissao, competencia, tomador_cnpj, tomador_nome, valor_servico, descricao_servico, codigo_trib_nacional";

type DpsLinha = {
  id: string;
  customer_id: string;
  service_id: string;
  valor: number;
  descricao: string;
  data_competencia: string;
  created_at: string;
  customer: { name: string } | null;
  nfse: { access_key: string | null } | { access_key: string | null }[] | null;
};

type ExternaLinha = {
  id: string;
  numero: string | null;
  chave_acesso: string | null;
  data_emissao: string | null;
  competencia: string | null;
  tomador_cnpj: string | null;
  tomador_nome: string | null;
  valor_servico: number | null;
  descricao_servico: string | null;
  codigo_trib_nacional: string | null;
};

const nfsesDa = (d: DpsLinha) => (Array.isArray(d.nfse) ? d.nfse : d.nfse ? [d.nfse] : []);

async function carregarMapas(supabase: Supa, companyId: string) {
  const [customers, { data: services }] = await Promise.all([
    buscarTudoPaginado<{ id: string; cpf_cnpj: string | null }>((from, to) =>
      supabase.from("customers").select("id, cpf_cnpj").eq("company_id", companyId).order("id").range(from, to),
    ),
    supabase.from("services").select("id, national_tax_code").eq("company_id", companyId).eq("active", true),
  ]);
  const clientePorDoc = new Map(
    customers.filter((c) => c.cpf_cnpj).map((c) => [c.cpf_cnpj!.replace(/\D/g, ""), c.id]),
  );
  const servicoPorCodigo = new Map(
    (services ?? []).filter((s) => s.national_tax_code).map((s) => [s.national_tax_code as string, s.id as string]),
  );
  return { clientePorDoc, servicoPorCodigo };
}

/** Converte dps (daqui) + notas_distribuidas (emissor externo) na lista de notas pra copiar. */
async function montarLista(
  supabase: Supa,
  companyId: string,
  doSistema: DpsLinha[],
  externas: ExternaLinha[],
  mapas: Awaited<ReturnType<typeof carregarMapas>>,
): Promise<NotaRecente[]> {
  const chavesDoSistema = new Set(doSistema.flatMap((d) => nfsesDa(d).map((n) => n.access_key)).filter(Boolean));
  const externasLista = externas.filter((n) => !chavesDoSistema.has(n.chave_acesso));

  // Externas sem CNPJ gravado (tomador PF): o CPF só está no XML.
  const semDoc = externasLista.filter((n) => !n.tomador_cnpj).map((n) => n.id);
  const docExtra = new Map<string, string>();
  for (let i = 0; i < semDoc.length; i += 100) {
    const { data: xmls } = await supabase
      .from("notas_distribuidas")
      .select("id, xml")
      .in("id", semDoc.slice(i, i + 100));
    for (const x of xmls ?? []) {
      const m = (x.xml as string | null)?.match(RE_DOC_TOMADOR);
      if (m) docExtra.set(x.id, m[2]);
    }
  }
  const clienteDaExterna = (n: ExternaLinha) => {
    const doc = (n.tomador_cnpj ?? docExtra.get(n.id) ?? "").replace(/\D/g, "");
    return doc ? mapas.clientePorDoc.get(doc) : undefined;
  };

  return [
    ...doSistema.map((d) => ({
      origem: "sistema" as const,
      id: d.id,
      data: d.data_competencia ?? d.created_at,
      numero: null,
      tomadorNome: d.customer?.name ?? "—",
      customerId: d.customer_id,
      serviceId: d.service_id,
      valor: Number(d.valor),
      descricao: d.descricao,
      pdfUrl: `/empresas/${companyId}/notas/${d.id}/pdf`,
    })),
    ...externasLista.map((n) => ({
      origem: "externa" as const,
      id: n.id,
      data: n.data_emissao ?? n.competencia,
      numero: n.numero,
      tomadorNome: n.tomador_nome ?? "—",
      customerId: clienteDaExterna(n),
      serviceId: n.codigo_trib_nacional ? mapas.servicoPorCodigo.get(n.codigo_trib_nacional) : undefined,
      valor: Number(n.valor_servico ?? 0),
      descricao: (n.descricao_servico ?? "").trim(),
      // notas_distribuidas só a equipe SOMA lê (RLS), então só ela vê essas.
      pdfUrl: `/admin/empresas/${companyId}/fechamento/notas/${n.id}/pdf`,
    })),
  ].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
}

function proximoMes(competencia: string) {
  const [a, m] = competencia.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/** Todas as notas de uma competência (AAAA-MM), daqui e do emissor externo. */
export async function carregarNotasDoMes(supabase: Supa, companyId: string, competencia: string) {
  const inicio = `${competencia}-01`;
  const fim = proximoMes(competencia);
  const [doSistema, externas, mapas] = await Promise.all([
    buscarTudoPaginado<DpsLinha>((from, to) =>
      supabase
        .from("dps")
        .select(SELECT_DPS)
        .eq("company_id", companyId)
        .eq("status", "ACCEPTED")
        .gte("data_competencia", inicio)
        .lt("data_competencia", fim)
        .order("created_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<{ data: DpsLinha[] | null; error: { message: string } | null }>,
    ),
    buscarTudoPaginado<ExternaLinha>((from, to) =>
      supabase
        .from("notas_distribuidas")
        .select(SELECT_EXTERNA)
        .eq("company_id", companyId)
        .eq("direcao", "saida")
        .eq("cancelada", false)
        .gte("competencia", inicio)
        .lt("competencia", fim)
        .order("data_emissao", { ascending: false })
        .range(from, to),
    ),
    carregarMapas(supabase, companyId),
  ]);
  return montarLista(supabase, companyId, doSistema, externas, mapas);
}

/**
 * Atalhos do formulário de emissão: repetir uma nota (?de=<dpsId>), as
 * últimas notas pra copiar e os tomadores/serviço que a empresa mais usa.
 * Considera também as notas emitidas fora daqui (notas_distribuidas), já
 * que a maioria das empresas ainda emite em outro emissor.
 */
export async function carregarPrefillEmissao(
  supabase: Supa,
  companyId: string,
  deDpsId?: string | string[],
): Promise<PrefillEmissao> {
  const de = typeof deDpsId === "string" && /^[0-9a-f-]{36}$/i.test(deDpsId) ? deDpsId : undefined;

  const [{ data: recentes }, origem, { data: externas }, mapas] = await Promise.all([
    supabase
      .from("dps")
      .select(SELECT_DPS)
      .eq("company_id", companyId)
      .eq("status", "ACCEPTED")
      .order("created_at", { ascending: false })
      .limit(300),
    de
      ? supabase
          .from("dps")
          .select("customer_id, service_id, valor, descricao")
          .eq("id", de)
          .eq("company_id", companyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("notas_distribuidas")
      .select(SELECT_EXTERNA)
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .eq("cancelada", false)
      .order("data_emissao", { ascending: false })
      .limit(300),
    carregarMapas(supabase, companyId),
  ]);

  const doSistema = (recentes ?? []) as unknown as DpsLinha[];
  const todasExternas = (externas ?? []) as ExternaLinha[];
  const ultimas = (
    await montarLista(supabase, companyId, doSistema, todasExternas.slice(0, 24), mapas)
  ).slice(0, 12);

  const contar = (ids: (string | undefined)[]) => {
    const c = new Map<string, number>();
    for (const id of ids) if (id) c.set(id, (c.get(id) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  };
  const o = origem.data as { customer_id: string; service_id: string; valor: number; descricao: string } | null;

  return {
    inicial: o
      ? {
          customerId: o.customer_id,
          serviceId: o.service_id,
          amount: String(o.valor).replace(".", ","),
          description: o.descricao,
        }
      : undefined,
    tomadoresFrequentes: contar([
      ...doSistema.map((d) => d.customer_id),
      ...todasExternas.map((n) =>
        n.tomador_cnpj ? mapas.clientePorDoc.get(n.tomador_cnpj.replace(/\D/g, "")) : undefined,
      ),
    ]).slice(0, 6),
    servicoMaisUsado: contar([
      ...doSistema.map((d) => d.service_id),
      ...todasExternas.map((n) =>
        n.codigo_trib_nacional ? mapas.servicoPorCodigo.get(n.codigo_trib_nacional) : undefined,
      ),
    ])[0],
    ultimasNotas: ultimas,
  };
}
