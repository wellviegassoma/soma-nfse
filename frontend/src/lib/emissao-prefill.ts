import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";

export type NotaRecente = {
  /** "sistema" = emitida aqui; "externa" = emitida em outro emissor (notas_distribuidas). */
  origem: "sistema" | "externa";
  id: string;
  data: string | null;
  tomadorNome: string;
  /** Tomador correspondente já cadastrado nesta empresa (pra copiar). */
  customerId?: string;
  serviceId?: string;
  valor: number;
  descricao: string;
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

const RE_DOC_TOMADOR = /<toma>[\s\S]*?<(CNPJ|CPF)>(\d+)<\/\1>/;

/**
 * Atalhos do formulário de emissão: repetir uma nota (?de=<dpsId>), as
 * últimas notas pra copiar e os tomadores/serviço que a empresa mais usa.
 * Considera também as notas emitidas fora daqui (notas_distribuidas), já
 * que a maioria das empresas ainda emite em outro emissor.
 */
export async function carregarPrefillEmissao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
  deDpsId?: string | string[],
): Promise<PrefillEmissao> {
  const de = typeof deDpsId === "string" && /^[0-9a-f-]{36}$/i.test(deDpsId) ? deDpsId : undefined;

  const [{ data: recentes }, origem, { data: externas }, customers, { data: services }] = await Promise.all([
    supabase
      .from("dps")
      .select("id, customer_id, service_id, valor, descricao, data_competencia, created_at, customer:customers(name), nfse(access_key)")
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
      .select("id, chave_acesso, data_emissao, competencia, tomador_cnpj, tomador_nome, valor_servico, descricao_servico, codigo_trib_nacional")
      .eq("company_id", companyId)
      .eq("direcao", "saida")
      .eq("cancelada", false)
      .order("data_emissao", { ascending: false })
      .limit(300),
    buscarTudoPaginado<{ id: string; cpf_cnpj: string | null }>((from, to) =>
      supabase.from("customers").select("id, cpf_cnpj").eq("company_id", companyId).range(from, to),
    ),
    supabase.from("services").select("id, national_tax_code").eq("company_id", companyId).eq("active", true),
  ]);

  const clientePorDoc = new Map(
    customers.filter((c) => c.cpf_cnpj).map((c) => [c.cpf_cnpj!.replace(/\D/g, ""), c.id]),
  );
  const servicoPorCodigo = new Map(
    (services ?? []).filter((s) => s.national_tax_code).map((s) => [s.national_tax_code as string, s.id as string]),
  );

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
  const doSistema = (recentes ?? []) as unknown as DpsLinha[];
  const chavesDoSistema = new Set(
    doSistema.flatMap((d) => (Array.isArray(d.nfse) ? d.nfse : d.nfse ? [d.nfse] : []).map((n) => n.access_key)).filter(Boolean),
  );

  // Externas sem CNPJ gravado (tomador PF): o CPF só está no XML — busca
  // o XML só das poucas que vão aparecer na lista.
  const externasLista = (externas ?? []).filter((n) => !chavesDoSistema.has(n.chave_acesso));
  const semDoc = externasLista.slice(0, 12).filter((n) => !n.tomador_cnpj).map((n) => n.id);
  const docExtra = new Map<string, string>();
  if (semDoc.length) {
    const { data: xmls } = await supabase.from("notas_distribuidas").select("id, xml").in("id", semDoc);
    for (const x of xmls ?? []) {
      const m = (x.xml as string | null)?.match(RE_DOC_TOMADOR);
      if (m) docExtra.set(x.id, m[2]);
    }
  }
  const clienteDaExterna = (n: { id: string; tomador_cnpj: string | null }) => {
    const doc = (n.tomador_cnpj ?? docExtra.get(n.id) ?? "").replace(/\D/g, "");
    return doc ? clientePorDoc.get(doc) : undefined;
  };

  const ultimas: NotaRecente[] = [
    ...doSistema.map((d) => ({
      origem: "sistema" as const,
      id: d.id,
      data: d.data_competencia ?? d.created_at,
      tomadorNome: d.customer?.name ?? "—",
      customerId: d.customer_id,
      serviceId: d.service_id,
      valor: Number(d.valor),
      descricao: d.descricao,
    })),
    ...externasLista.slice(0, 12).map((n) => ({
      origem: "externa" as const,
      id: n.id,
      data: n.competencia ?? n.data_emissao,
      tomadorNome: n.tomador_nome ?? "—",
      customerId: clienteDaExterna(n),
      serviceId: n.codigo_trib_nacional ? servicoPorCodigo.get(n.codigo_trib_nacional) : undefined,
      valor: Number(n.valor_servico ?? 0),
      descricao: (n.descricao_servico ?? "").trim(),
    })),
  ]
    .sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")))
    .slice(0, 12);

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
      ...externasLista.map((n) => (n.tomador_cnpj ? clientePorDoc.get(n.tomador_cnpj.replace(/\D/g, "")) : undefined)),
    ]).slice(0, 6),
    servicoMaisUsado: contar([
      ...doSistema.map((d) => d.service_id),
      ...externasLista.map((n) => (n.codigo_trib_nacional ? servicoPorCodigo.get(n.codigo_trib_nacional) : undefined)),
    ])[0],
    ultimasNotas: ultimas,
  };
}
