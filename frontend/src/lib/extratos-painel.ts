import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import type { Etapa, StatusMes } from "@/lib/extratos-status";

// Dados do painel de Extratos: cada empresa num estágio do fluxo do mês
// (aguardando cliente → parcial → conferir → pronto para lançar → conciliado),
// com uma "bolinha" por conta.

const RECEBIDOS: StatusMes[] = ["RECEBIDO", "CONFERIDO", "CONCILIADO", "SEM_MOVIMENTO", "ENCERRADA"];
const CONFERIDOS: StatusMes[] = ["CONFERIDO", "CONCILIADO", "SEM_MOVIMENTO", "ENCERRADA"];
const FECHADOS: StatusMes[] = ["CONCILIADO", "SEM_MOVIMENTO", "ENCERRADA"];

export function etapaDe(status: StatusMes[]): Etapa {
  if (!status.length) return "AGUARDANDO";
  if (status.every((s) => FECHADOS.includes(s))) return "CONCILIADO";
  if (status.every((s) => CONFERIDOS.includes(s))) return "PRONTO";
  if (status.every((s) => RECEBIDOS.includes(s))) return "CONFERIR";
  if (status.some((s) => RECEBIDOS.includes(s))) return "PARCIAL";
  return "AGUARDANDO";
}

export type ContaPainel = { id: string; banco: string; conta: string; status: StatusMes; avisos: string[] };
export type EmpresaPainel = {
  id: string;
  codigo: string | null;
  nome: string;
  responsavelId: string | null;
  etapa: Etapa;
  semConta: boolean;
  contas: ContaPainel[];
  cobradaEm: string | null;
  avisos: number;
};
export type Responsavel = { id: string; nome: string; total: number; recebidas: number };

export async function carregarPainel(competencia: string): Promise<{ empresas: EmpresaPainel[]; responsaveis: Responsavel[]; fila: number }> {
  const db = await createClient();
  const empresas = await buscarTudoPaginado<{
    id: string;
    codigo_cliente: string | null;
    legal_name: string;
    trade_name: string | null;
    responsavel_contabil_id: string | null;
  }>((f, t) =>
    db.from("companies").select("id, codigo_cliente, legal_name, trade_name, responsavel_contabil_id").eq("ativa", true).range(f, t),
  );
  const contas = await buscarTudoPaginado<{
    id: string;
    company_id: string;
    banco: string;
    conta: string;
    data_inicio_controle: string | null;
    data_fim_controle: string | null;
  }>((f, t) =>
    db.from("extrato_contas_bancarias").select("id, company_id, banco, conta, data_inicio_controle, data_fim_controle").eq("ativo", true).order("created_at").range(f, t),
  );
  const [meses, arquivos, cobrancas, fila] = await Promise.all([
    buscarTudoPaginado<{ conta_id: string; status: StatusMes }>((f, t) =>
      db.from("extratos_mensais").select("conta_id, status").eq("competencia", competencia).range(f, t),
    ),
    buscarTudoPaginado<{ conta_id: string | null; avisos: { mensagem: string }[] }>((f, t) =>
      db.from("extrato_arquivos").select("conta_id, avisos").eq("competencia", competencia).eq("situacao", "IDENTIFICADO").range(f, t),
    ).catch(() => []),
    db
      .from("extrato_cobrancas")
      .select("company_id, created_at")
      .gte("created_at", `${competencia}-01`)
      .order("created_at", { ascending: false })
      .then((r) => r.data ?? []),
    db
      .from("extrato_arquivos")
      .select("id", { count: "exact", head: true })
      .in("situacao", ["CONFIRMAR", "ERRO"])
      .then((r) => r.count ?? 0),
  ]);

  const statusPorConta = new Map(meses.map((m) => [m.conta_id, m.status]));
  const avisosPorConta = new Map<string, string[]>();
  for (const a of arquivos) {
    if (!a.conta_id || !a.avisos?.length) continue;
    avisosPorConta.set(a.conta_id, [...(avisosPorConta.get(a.conta_id) ?? []), ...a.avisos.map((x) => x.mensagem)]);
  }
  const cobrada = new Map<string, string>();
  for (const c of cobrancas) if (!cobrada.has(c.company_id as string)) cobrada.set(c.company_id as string, c.created_at as string);

  const contasPorEmpresa = new Map<string, typeof contas>();
  for (const c of contas) {
    const ini = c.data_inicio_controle?.slice(0, 7);
    const fim = c.data_fim_controle?.slice(0, 7);
    if ((ini && ini > competencia) || (fim && fim < competencia)) continue;
    contasPorEmpresa.set(c.company_id, [...(contasPorEmpresa.get(c.company_id) ?? []), c]);
  }

  const lista: EmpresaPainel[] = [];
  for (const e of empresas) {
    const cs = contasPorEmpresa.get(e.id) ?? [];
    if (!cs.length && !e.responsavel_contabil_id) continue; // fora do controle de extratos
    const contasPainel: ContaPainel[] = cs.map((c) => ({
      id: c.id,
      banco: c.banco,
      conta: c.conta,
      status: statusPorConta.get(c.id) ?? "PENDENTE",
      avisos: avisosPorConta.get(c.id) ?? [],
    }));
    lista.push({
      id: e.id,
      codigo: e.codigo_cliente,
      nome: e.trade_name || e.legal_name,
      responsavelId: e.responsavel_contabil_id,
      etapa: etapaDe(contasPainel.map((c) => c.status)),
      semConta: cs.length === 0,
      contas: contasPainel,
      cobradaEm: cobrada.get(e.id) ?? null,
      avisos: contasPainel.reduce((n, c) => n + c.avisos.length, 0),
    });
  }
  lista.sort((a, b) => (a.codigo ?? "zzz").localeCompare(b.codigo ?? "zzz", "pt-BR", { numeric: true }));

  const ids = [...new Set(lista.map((e) => e.responsavelId).filter(Boolean))] as string[];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data } = await createAdminClient().from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of data ?? []) nomes.set(p.id as string, (p.full_name || p.email) as string);
  }
  const responsaveis: Responsavel[] = ids
    .map((id) => {
      const doResp = lista.filter((e) => e.responsavelId === id);
      return {
        id,
        nome: nomes.get(id) ?? "—",
        total: doResp.length,
        recebidas: doResp.filter((e) => ["CONFERIR", "PRONTO", "CONCILIADO"].includes(e.etapa)).length,
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return { empresas: lista, responsaveis, fila };
}
