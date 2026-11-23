import "server-only";

// Módulo de Tarefas — geração e prazos (docs/tarefas.md §6).
//
// Prazo e meta dependem só de modelo × competência (não da empresa), então
// são calculados uma vez por modelo e aplicados a todas as tarefas dele.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { createAdminClient } from "@/lib/supabase/admin";
import { chaveObrigacao, dataMeta } from "@/lib/agenda-tributaria";
import { somarMeses, type StatusTarefa } from "@/lib/tarefas-comum";

type Db = SupabaseClient;

export type Modelo = {
  id: string;
  nome: string;
  descricao: string | null;
  departamento_id: string;
  periodicidade: "MENSAL" | "TRIMESTRAL" | "ANUAL";
  meses: number[] | null;
  prazo_tipo: "AGENDA" | "DIA_FIXO";
  agenda_chave: string | null;
  dia_prazo: number | null;
  dia_meta: number | null;
  mes_prazo_offset: number;
  aplica_regimes: string[] | null;
  aplica_pessoa: "PF" | "PJ" | null;
  aplica_municipios: string[] | null;
  aplica_folha: boolean | null;
  ativo: boolean;
  ordem: number;
};

export const MODELO_COLUNAS =
  "id, nome, descricao, departamento_id, periodicidade, meses, prazo_tipo, agenda_chave, dia_prazo, dia_meta, mes_prazo_offset, aplica_regimes, aplica_pessoa, aplica_municipios, aplica_folha, ativo, ordem";

export type EmpresaTarefa = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  tax_regime: string | null;
  person_type: "PF" | "PJ" | null;
  municipality_ibge_code: string | null;
  municipality_name: string | null;
  ativa: boolean;
  data_encerramento_soma: string | null;
};

export function nomeEmpresa(e: Pick<EmpresaTarefa, "legal_name" | "trade_name" | "codigo_cliente">): string {
  const nome = e.trade_name || e.legal_name;
  return e.codigo_cliente ? `${e.codigo_cliente} · ${nome}` : nome;
}

export async function carregarEmpresas(db: Db): Promise<EmpresaTarefa[]> {
  return buscarTudoPaginado<EmpresaTarefa>((from, to) =>
    db
      .from("companies")
      .select(
        "id, legal_name, trade_name, codigo_cliente, tax_regime, person_type, municipality_ibge_code, municipality_name, ativa, data_encerramento_soma",
      )
      .order("legal_name")
      .range(from, to),
  );
}

/** Equipe SOMA (quem tem permissão global), para escolher responsável. */
export async function listarEquipe(): Promise<{ id: string; nome: string }[]> {
  const admin = createAdminClient();
  const { data: globais } = await admin.from("usuario_permissoes").select("user_id").is("company_id", null);
  const ids = [...new Set((globais ?? []).map((g) => g.user_id as string))];
  if (!ids.length) return [];
  const { data: perfis } = await admin.from("profiles").select("id, full_name, email, ativo").in("id", ids);
  return (perfis ?? [])
    .filter((p) => p.ativo !== false)
    .map((p) => ({ id: p.id as string, nome: (p.full_name || p.email || p.id) as string }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

// ------------------------------------------------------------------ prazos

/** Dia `dia` do mês (limitado ao último); sábado/domingo antecipa para sexta. */
function diaNoMes(mes: string, dia: number): string {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const d = new Date(Date.UTC(a, m - 1, Math.min(dia, ultimo)));
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() - 1);
  if (dow === 0) d.setUTCDate(d.getUTCDate() - 2);
  return d.toISOString().slice(0, 10);
}

/** A chave do modelo pode ser a chave inteira da obrigação ou um prefixo dela. */
export function casaObrigacao(item: { tipo: string; codigo: string | null; descricao: string }, ref: string): boolean {
  const chave = chaveObrigacao(item as Parameters<typeof chaveObrigacao>[0]);
  return chave === ref || chave.startsWith(ref);
}

type ItemAgenda = { tipo: "TRIBUTO" | "DECLARACAO"; codigo: string | null; descricao: string; vencimento: string | null };

class CacheAgenda {
  private meses = new Map<string, Promise<ItemAgenda[]>>();
  private metas: Promise<Map<string, number>> | null = null;
  constructor(private db: Db) {}
  itens(mes: string) {
    let p = this.meses.get(mes);
    if (!p) {
      p = buscarTudoPaginado<ItemAgenda>((from, to) =>
        this.db
          .from("agenda_tributaria_itens")
          .select("tipo, codigo, descricao, vencimento")
          .eq("mes", `${mes}-01`)
          .order("ordem")
          .range(from, to),
      );
      this.meses.set(mes, p);
    }
    return p;
  }
  metaPorChave() {
    this.metas ??= Promise.resolve(
      this.db.from("agenda_tributaria_metas").select("chave, dia_meta"),
    ).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((m) => [m.chave as string, m.dia_meta as number]));
    });
    return this.metas;
  }
}

export async function prazosDoModelo(
  m: Modelo,
  competencia: string,
  cache: CacheAgenda,
): Promise<{ prazo_legal: string | null; prazo_meta: string | null }> {
  const mes = somarMeses(competencia, m.mes_prazo_offset);
  let legal: string | null = null;
  let metaAgenda: number | null = null;
  if (m.prazo_tipo === "DIA_FIXO") {
    legal = m.dia_prazo ? diaNoMes(mes, m.dia_prazo) : null;
  } else if (m.agenda_chave) {
    const candidatos = (await cache.itens(mes)).filter((i) => i.vencimento && casaObrigacao(i, m.agenda_chave!));
    candidatos.sort((a, b) => a.vencimento!.localeCompare(b.vencimento!));
    const item = candidatos[0];
    if (item) {
      legal = item.vencimento;
      metaAgenda = (await cache.metaPorChave()).get(chaveObrigacao(item)) ?? null;
    }
  }
  const diaMeta = m.dia_meta ?? metaAgenda;
  const meta = legal && diaMeta ? dataMeta(legal, diaMeta) : legal;
  return { prazo_legal: legal, prazo_meta: meta };
}

// ----------------------------------------------------------------- geração

export function modeloGeraNaCompetencia(m: Pick<Modelo, "periodicidade" | "meses">, competencia: string): boolean {
  if (m.periodicidade === "MENSAL") return true;
  const mes = Number(competencia.slice(5, 7));
  const meses = m.meses?.length ? m.meses : m.periodicidade === "TRIMESTRAL" ? [3, 6, 9, 12] : [12];
  return meses.includes(mes);
}

export function empresaNoFiltro(
  m: Modelo,
  e: EmpresaTarefa,
  temFolha: boolean,
  excecao: "INCLUIR" | "EXCLUIR" | undefined,
): boolean {
  if (excecao === "EXCLUIR") return false;
  if (excecao === "INCLUIR") return true;
  if (m.aplica_regimes?.length && !m.aplica_regimes.includes(e.tax_regime ?? "")) return false;
  if (m.aplica_pessoa && e.person_type !== m.aplica_pessoa) return false;
  if (m.aplica_municipios?.length && !m.aplica_municipios.includes(e.municipality_ibge_code ?? "")) return false;
  if (m.aplica_folha === true && !temFolha) return false;
  if (m.aplica_folha === false && temFolha) return false;
  return true;
}

/** Empresa atendida na competência: ativa e não encerrada antes dela. */
export function empresaAtendida(e: EmpresaTarefa, competencia: string): boolean {
  if (!e.ativa) return false;
  return !e.data_encerramento_soma || e.data_encerramento_soma >= `${competencia}-01`;
}

async function empresasComFolha(db: Db, competencia: string): Promise<Set<string>> {
  const comps = [competencia, somarMeses(competencia, -1), somarMeses(competencia, -2)];
  const linhas = await buscarTudoPaginado<{ company_id: string }>((from, to) =>
    db.from("folha_mensal").select("company_id").in("competencia", comps).gt("valor", 0).range(from, to),
  );
  return new Set(linhas.map((l) => l.company_id));
}

const STATUS_ABERTOS: StatusTarefa[] = ["A_FAZER", "EM_ANDAMENTO"];

export type ResultadoGeracao = { competencia: string; modelos: number; criadas: number; prazosAtualizados: number };

/**
 * Cria as tarefas da competência que ainda não existem (idempotente: chave
 * única modelo × empresa × competência) e atualiza prazo/meta das abertas
 * (agenda publicada depois, meta SOMA alterada).
 */
export async function gerarTarefas(
  db: Db,
  competencia: string,
  opcoes: { modeloIds?: string[]; criar?: boolean } = {},
): Promise<ResultadoGeracao> {
  const { modeloIds, criar = true } = opcoes;
  let q = db.from("tarefa_modelos").select(MODELO_COLUNAS).eq("ativo", true);
  if (modeloIds?.length) q = q.in("id", modeloIds);
  const { data: modelosRaw, error } = await q;
  if (error) throw new Error(error.message);
  const modelos = ((modelosRaw ?? []) as Modelo[]).filter((m) => modeloGeraNaCompetencia(m, competencia));
  if (!modelos.length) return { competencia, modelos: 0, criadas: 0, prazosAtualizados: 0 };

  const [empresas, folha, excecoes, carteira, existentes] = await Promise.all([
    carregarEmpresas(db),
    empresasComFolha(db, competencia),
    buscarTudoPaginado<{ modelo_id: string; company_id: string; tipo: "INCLUIR" | "EXCLUIR" }>((from, to) =>
      db.from("tarefa_modelo_excecoes").select("modelo_id, company_id, tipo").range(from, to),
    ),
    buscarTudoPaginado<{ company_id: string; departamento_id: string; user_id: string }>((from, to) =>
      db.from("tarefa_responsaveis").select("company_id, departamento_id, user_id").range(from, to),
    ),
    buscarTudoPaginado<{ modelo_id: string; company_id: string }>((from, to) =>
      db
        .from("tarefas")
        .select("modelo_id, company_id")
        .eq("competencia", competencia)
        .in("modelo_id", modelos.map((m) => m.id))
        .range(from, to),
    ),
  ]);

  const excecao = new Map(excecoes.map((x) => [`${x.modelo_id}|${x.company_id}`, x.tipo]));
  const responsavel = new Map(carteira.map((c) => [`${c.company_id}|${c.departamento_id}`, c.user_id]));
  const ja = new Set(existentes.map((t) => `${t.modelo_id}|${t.company_id}`));
  const atendidas = empresas.filter((e) => empresaAtendida(e, competencia));
  const cache = new CacheAgenda(db);

  const novas: Record<string, unknown>[] = [];
  let prazosAtualizados = 0;
  for (const m of modelos) {
    const prazos = await prazosDoModelo(m, competencia, cache);
    for (const e of atendidas) {
      if (!criar || ja.has(`${m.id}|${e.id}`)) continue;
      if (!empresaNoFiltro(m, e, folha.has(e.id), excecao.get(`${m.id}|${e.id}`))) continue;
      novas.push({
        modelo_id: m.id,
        company_id: e.id,
        competencia,
        departamento_id: m.departamento_id,
        responsavel_id: responsavel.get(`${e.id}|${m.departamento_id}`) ?? null,
        ...prazos,
      });
    }
    // Abertas com prazo diferente do calculado agora.
    if (prazos.prazo_legal) {
      const { count, error: eUp } = await db
        .from("tarefas")
        .update(prazos, { count: "exact" })
        .eq("modelo_id", m.id)
        .eq("competencia", competencia)
        .in("status", STATUS_ABERTOS)
        .or(
          `prazo_legal.is.null,prazo_legal.neq.${prazos.prazo_legal},prazo_meta.is.null,prazo_meta.neq.${prazos.prazo_meta}`,
        );
      if (eUp) throw new Error(eUp.message);
      prazosAtualizados += count ?? 0;
    }
  }

  for (let i = 0; i < novas.length; i += 500) {
    const { error: eIns } = await db
      .from("tarefas")
      .upsert(novas.slice(i, i + 500), { onConflict: "modelo_id,company_id,competencia", ignoreDuplicates: true });
    if (eIns) throw new Error(eIns.message);
  }
  return { competencia, modelos: modelos.length, criadas: novas.length, prazosAtualizados };
}

/** Competências com tarefa aberta ainda sem prazo legal (agenda publicada depois). */
export async function competenciasSemPrazo(db: Db): Promise<string[]> {
  const { data, error } = await db
    .from("tarefas")
    .select("competencia")
    .is("prazo_legal", null)
    .in("status", STATUS_ABERTOS)
    .limit(1000);
  if (error) throw new Error(error.message);
  return [...new Set((data ?? []).map((r) => r.competencia as string))].sort();
}
