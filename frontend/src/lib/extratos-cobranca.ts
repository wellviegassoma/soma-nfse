import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { competenciasNoIntervalo } from "@/lib/competencia";
import { mensagemCobrancaExtratos, type ItemCobranca } from "@/lib/extratos-cobranca-mensagem";

// Monta a lista de cobrança de extratos: para cada empresa da carteira, as
// contas ativas cujo extrato da competência (e, se pedido, dos meses
// anteriores desde o início do controle da conta) ainda não foi entregue.
//
// Meses anteriores só entram quando a conta tem "data de início do controle"
// — sem ela não dá pra saber desde quando cobrar, e as contas recém-
// importadas encheriam a mensagem de meses que a equipe já tem fora do sistema.

export type GrupoWhatsapp = { contactId: string; nome: string };

export type EmpresaCobranca = {
  id: string;
  codigo: string | null;
  nome: string;
  responsavelId: string | null;
  semConta: boolean; // empresa sem nenhuma conta ativa cadastrada
  itens: ItemCobranca[];
  grupos: GrupoWhatsapp[];
  ultimaCobranca: { em: string; por: string | null } | null;
  texto: string;
};

type Conta = {
  id: string;
  company_id: string;
  banco: string;
  agencia: string;
  conta: string;
  data_inicio_controle: string | null;
  data_fim_controle: string | null;
  created_at: string;
};

/** Itens pendentes de uma empresa (função pura, reaproveitada pela action). */
export function itensPendentes(
  contas: Conta[],
  entregues: Set<string>, // `${contaId}-${competencia}`
  competencia: string,
  incluirAnteriores: boolean,
): ItemCobranca[] {
  const itens: ItemCobranca[] = [];
  for (const c of contas) {
    const fim = c.data_fim_controle?.slice(0, 7);
    if (fim && fim < competencia && !incluirAnteriores) continue;
    const inicio = c.data_inicio_controle?.slice(0, 7);
    if (inicio && inicio > competencia) continue;
    const ultimo = fim && fim < competencia ? fim : competencia;
    const meses =
      incluirAnteriores && inicio ? competenciasNoIntervalo(inicio, ultimo) : ultimo === competencia ? [competencia] : [];
    const faltam = meses.filter((m) => !entregues.has(`${c.id}-${m}`));
    if (faltam.length) itens.push({ contaId: c.id, banco: c.banco, agencia: c.agencia, conta: c.conta, meses: faltam });
  }
  return itens;
}

/** Grupos do WhatsApp por empresa (tabela de Atendimento — leitura via admin, depois da checagem de permissão). */
export async function gruposPorEmpresa(companyIds: string[]): Promise<Map<string, GrupoWhatsapp[]>> {
  const mapa = new Map<string, GrupoWhatsapp[]>();
  if (!companyIds.length) return mapa;
  const admin = createAdminClient();
  const { data } = await admin
    .from("pedido_nota_vinculos")
    .select("company_id, origem_contact_id, grupo_nome, created_at")
    .eq("origem", "DIGISAC")
    .in("company_id", companyIds)
    .order("created_at", { ascending: false }); // o vínculo mais recente vem primeiro (padrão do envio)
  for (const v of data ?? []) {
    const lista = mapa.get(v.company_id as string) ?? [];
    if (lista.some((g) => g.contactId === v.origem_contact_id)) continue; // vínculo repetido do mesmo grupo
    lista.push({ contactId: v.origem_contact_id as string, nome: (v.grupo_nome as string | null) || "Contato do WhatsApp" });
    mapa.set(v.company_id as string, lista);
  }
  return mapa;
}

export async function carregarCobranca(p: {
  responsavelId: string | null; // null = todas as empresas com responsável
  competencia: string;
  incluirAnteriores: boolean;
  companyIds?: string[];
}): Promise<EmpresaCobranca[]> {
  const supabase = await createClient();
  let q = supabase
    .from("companies")
    .select("id, codigo_cliente, legal_name, trade_name, responsavel_contabil_id")
    .eq("ativa", true);
  if (p.companyIds) q = q.in("id", p.companyIds);
  else if (p.responsavelId) q = q.eq("responsavel_contabil_id", p.responsavelId);
  else q = q.not("responsavel_contabil_id", "is", null);
  const { data: empresas } = await q;
  const ids = (empresas ?? []).map((e) => e.id as string);
  if (!ids.length) return [];

  const { data: contasData } = await supabase
    .from("extrato_contas_bancarias")
    .select("id, company_id, banco, agencia, conta, data_inicio_controle, data_fim_controle, created_at")
    .in("company_id", ids)
    .eq("ativo", true)
    .order("created_at");
  const contas = (contasData ?? []) as Conta[];
  const contaIds = contas.map((c) => c.id);

  const entregues = new Set<string>();
  for (let i = 0; i < contaIds.length; i += 200) {
    const { data } = await supabase
      .from("extratos_mensais")
      .select("conta_id, competencia")
      .eq("entregue", true)
      .lte("competencia", p.competencia)
      .in("conta_id", contaIds.slice(i, i + 200));
    for (const e of data ?? []) entregues.add(`${e.conta_id}-${e.competencia}`);
  }

  const [grupos, cobrancas] = await Promise.all([
    gruposPorEmpresa(ids),
    supabase
      .from("extrato_cobrancas")
      .select("company_id, created_at, enviado_por")
      .in("company_id", ids)
      .order("created_at", { ascending: false })
      .then((r) => (r.error ? [] : (r.data ?? []))), // tabela ainda não criada → sem histórico
  ]);
  const ultima = new Map<string, { em: string; por: string | null }>();
  for (const c of cobrancas) {
    if (!ultima.has(c.company_id as string)) {
      ultima.set(c.company_id as string, { em: c.created_at as string, por: (c.enviado_por as string | null) ?? null });
    }
  }
  const autores = [...new Set([...ultima.values()].map((u) => u.por).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (autores.length) {
    const { data } = await createAdminClient().from("profiles").select("id, full_name, email").in("id", autores);
    for (const pr of data ?? []) nomes.set(pr.id as string, (pr.full_name || pr.email) as string);
  }

  const out: EmpresaCobranca[] = [];
  for (const e of empresas ?? []) {
    const nome = (e.trade_name || e.legal_name) as string;
    const contasEmpresa = contas.filter((c) => c.company_id === e.id);
    const itens = itensPendentes(contasEmpresa, entregues, p.competencia, p.incluirAnteriores);
    const semConta = contasEmpresa.length === 0;
    if (!semConta && itens.length === 0) continue; // tudo entregue
    const u = ultima.get(e.id as string);
    out.push({
      id: e.id as string,
      codigo: (e.codigo_cliente as string | null) ?? null,
      nome,
      responsavelId: (e.responsavel_contabil_id as string | null) ?? null,
      semConta,
      itens,
      grupos: grupos.get(e.id as string) ?? [],
      ultimaCobranca: u ? { em: u.em, por: u.por ? (nomes.get(u.por) ?? null) : null } : null,
      texto: mensagemCobrancaExtratos({ empresa: nome, itens, competencia: p.competencia }),
    });
  }
  return out.sort((a, b) => (a.codigo ?? "").localeCompare(b.codigo ?? "", "pt-BR", { numeric: true }));
}

/** Quem é responsável pela contabilidade de alguma empresa (para o filtro). */
export async function responsaveisContabeis(): Promise<{ id: string; nome: string; empresas: number }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("companies").select("responsavel_contabil_id").eq("ativa", true).not("responsavel_contabil_id", "is", null);
  const cont = new Map<string, number>();
  for (const r of data ?? []) cont.set(r.responsavel_contabil_id as string, (cont.get(r.responsavel_contabil_id as string) ?? 0) + 1);
  if (!cont.size) return [];
  const { data: perfis } = await createAdminClient().from("profiles").select("id, full_name, email").in("id", [...cont.keys()]);
  return (perfis ?? [])
    .map((pr) => ({ id: pr.id as string, nome: (pr.full_name || pr.email) as string, empresas: cont.get(pr.id as string) ?? 0 }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
