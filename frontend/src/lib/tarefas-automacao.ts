import "server-only";

// Tarefas — Fase 2 (docs/tarefas.md §9): etapas, cascata e conclusão
// automática pelas centrais do sistema.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { FONTES_ROTULO, type FonteAutomatica } from "@/lib/tarefas-comum";

type Db = SupabaseClient;
type Resultado = "OK" | "NAO_SE_APLICA";

function blocos<T>(lista: T[], n = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += n) out.push(lista.slice(i, i + n));
  return out;
}

// ------------------------------------------------------------------ fontes

/** Empresa → resultado da central na competência (só quem já está feito). */
async function lerFonte(db: Db, fonte: FonteAutomatica, competencia: string): Promise<Map<string, Resultado>> {
  const m = new Map<string, Resultado>();
  const ok = (ids: { company_id: string }[]) => ids.forEach((r) => m.set(r.company_id, "OK"));
  const pagina = <T,>(fn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) =>
    buscarTudoPaginado<T>(fn);

  switch (fonte) {
    case "SIMPLES_APROVADO":
      ok(await pagina((f, t) => db.from("simples_conferencia_aprovacoes").select("company_id").eq("competencia", competencia).range(f, t)));
      break;
    case "PGDAS_TRANSMITIDO":
      ok(await pagina((f, t) => db.from("integra_contador_pgdas_declaracoes").select("company_id").eq("competencia", competencia).range(f, t)));
      break;
    case "DAS_PAGO":
      ok(await pagina((f, t) => db.from("das_pagamentos").select("company_id").eq("competencia", competencia).eq("status", "pago").range(f, t)));
      break;
    case "MIT_ENCERRADA":
      ok(
        await pagina((f, t) =>
          db.from("integra_contador_mit_encerramentos").select("company_id").eq("competencia", competencia).neq("situacao_apuracao", "ERRO").range(f, t),
        ),
      );
      break;
    case "ISS_MARCADO":
      ok(await pagina((f, t) => db.from("iss_fechamentos").select("company_id").eq("competencia", competencia).range(f, t)));
      break;
    case "ISS_PAGO":
      ok(await pagina((f, t) => db.from("iss_pagamentos").select("company_id").eq("competencia", competencia).eq("status", "paga").range(f, t)));
      break;
    case "REINF_ENVIADA": {
      const linhas = await pagina<{ company_id: string; status: string }>((f, t) =>
        db.from("reinf_fechamentos").select("company_id, status").eq("competencia", competencia).in("status", ["enviado", "dispensado"]).range(f, t),
      );
      for (const r of linhas) m.set(r.company_id, r.status === "dispensado" ? "NAO_SE_APLICA" : "OK");
      break;
    }
    case "EXTRATOS_ENTREGUES": {
      // Todas as contas ativas da empresa com o extrato do mês entregue.
      const [contas, entregues] = await Promise.all([
        pagina<{ id: string; company_id: string }>((f, t) =>
          db.from("extrato_contas_bancarias").select("id, company_id").eq("ativo", true).range(f, t),
        ),
        pagina<{ conta_id: string }>((f, t) =>
          db.from("extratos_mensais").select("conta_id").eq("competencia", competencia).eq("entregue", true).range(f, t),
        ),
      ]);
      const feitas = new Set(entregues.map((e) => e.conta_id));
      const porEmpresa = new Map<string, boolean>();
      for (const c of contas) porEmpresa.set(c.company_id, (porEmpresa.get(c.company_id) ?? true) && feitas.has(c.id));
      for (const [id, tudo] of porEmpresa) if (tudo) m.set(id, "OK");
      break;
    }
    case "MES_FECHADO":
      ok(await pagina((f, t) => db.from("fechamentos_mensais").select("company_id").eq("competencia", competencia).range(f, t)));
      break;
  }
  return m;
}

// ----------------------------------------------------------------- etapas

type EtapaDef = { id: string; modelo_id: string; ordem: number; departamento_id: string | null; fonte_automatica: string | null; depende_do_cliente: boolean };

async function etapasDosModelos(db: Db, modeloIds: string[]): Promise<Map<string, EtapaDef[]>> {
  const m = new Map<string, EtapaDef[]>();
  if (!modeloIds.length) return m;
  const { data, error } = await db
    .from("tarefa_modelo_etapas")
    .select("id, modelo_id, ordem, departamento_id, fonte_automatica, depende_do_cliente")
    .in("modelo_id", modeloIds)
    .order("ordem");
  if (error) throw new Error(error.message);
  for (const e of (data ?? []) as EtapaDef[]) {
    const arr = m.get(e.modelo_id) ?? [];
    arr.push(e);
    m.set(e.modelo_id, arr);
  }
  return m;
}

/** Departamento efetivo de cada etapa: o dela, senão o da anterior, senão o do modelo. */
function departamentosEfetivos(etapas: EtapaDef[], deptoModelo: string): Map<string, string> {
  const out = new Map<string, string>();
  let atual = deptoModelo;
  for (const e of etapas) {
    atual = e.departamento_id ?? atual;
    out.set(e.id, atual);
  }
  return out;
}

/**
 * Recalcula status, etapa atual, "aguardando cliente" e o dono (cascata) das
 * tarefas. Por padrão só mexe nas abertas; `reabrir` deixa uma etapa desfeita
 * reabrir tarefa concluída (ação manual de quem desmarcou).
 */
export async function recalcularTarefas(db: Db, tarefaIds: string[], opcoes: { reabrir?: boolean } = {}): Promise<number> {
  let mudou = 0;
  for (const ids of blocos([...new Set(tarefaIds)])) {
    const [{ data: tarefas, error: e1 }, { data: feitas, error: e2 }] = await Promise.all([
      db
        .from("tarefas")
        .select("id, modelo_id, company_id, departamento_id, responsavel_id, status, etapa_atual, aguardando_cliente, tarefa_modelos(departamento_id)")
        .in("id", ids),
      db.from("tarefa_etapas").select("tarefa_id, etapa_id, concluida_em").in("tarefa_id", ids),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    type T = {
      id: string;
      modelo_id: string;
      company_id: string;
      departamento_id: string;
      responsavel_id: string | null;
      status: string;
      etapa_atual: number | null;
      aguardando_cliente: boolean;
      tarefa_modelos: { departamento_id: string } | null;
    };
    const lista = (tarefas ?? []) as unknown as T[];
    const defs = await etapasDosModelos(db, [...new Set(lista.map((t) => t.modelo_id))]);
    const instancias = new Map<string, Map<string, string | null>>();
    for (const f of (feitas ?? []) as { tarefa_id: string; etapa_id: string; concluida_em: string | null }[]) {
      const mm = instancias.get(f.tarefa_id) ?? new Map();
      mm.set(f.etapa_id, f.concluida_em);
      instancias.set(f.tarefa_id, mm);
    }
    const empresas = [...new Set(lista.map((t) => t.company_id))];
    const { data: carteira } = await db
      .from("tarefa_responsaveis")
      .select("company_id, departamento_id, user_id")
      .in("company_id", empresas);
    const dono = new Map((carteira ?? []).map((c) => [`${c.company_id}|${c.departamento_id}`, c.user_id as string]));

    for (const t of lista) {
      const etapas = defs.get(t.modelo_id) ?? [];
      const inst = instancias.get(t.id);
      if (!etapas.length || !inst) continue;
      const aberta = t.status === "A_FAZER" || t.status === "EM_ANDAMENTO";
      if (!aberta && !(opcoes.reabrir && t.status === "CONCLUIDA")) continue;
      const doTarefa = etapas.filter((e) => inst.has(e.id));
      const pendentes = doTarefa.filter((e) => !inst.get(e.id));
      const algumaFeita = doTarefa.length > pendentes.length;
      const upd: Record<string, unknown> = {};
      if (!pendentes.length) {
        if (t.status !== "CONCLUIDA") Object.assign(upd, { status: "CONCLUIDA", concluida_em: new Date().toISOString() });
        if (t.etapa_atual !== null) upd.etapa_atual = null;
        if (t.aguardando_cliente) upd.aguardando_cliente = false;
      } else {
        const prox = pendentes[0];
        const deptos = departamentosEfetivos(etapas, t.tarefa_modelos?.departamento_id ?? t.departamento_id);
        const depto = deptos.get(prox.id)!;
        const aguardando = pendentes.every((e) => e.depende_do_cliente);
        const status = algumaFeita ? "EM_ANDAMENTO" : t.status === "CONCLUIDA" ? "A_FAZER" : t.status;
        if (status !== t.status) Object.assign(upd, { status, concluida_em: null, concluida_por: null, concluida_por_fonte: null });
        if (t.etapa_atual !== prox.ordem) upd.etapa_atual = prox.ordem;
        if (t.aguardando_cliente !== aguardando) upd.aguardando_cliente = aguardando;
        if (depto !== t.departamento_id) {
          // Cascata: passa para o responsável do próximo departamento.
          upd.departamento_id = depto;
          upd.responsavel_id = dono.get(`${t.company_id}|${depto}`) ?? null;
        }
      }
      if (Object.keys(upd).length) {
        const { error } = await db.from("tarefas").update(upd).eq("id", t.id);
        if (error) throw new Error(error.message);
        mudou++;
      }
    }
  }
  return mudou;
}

/** Cria as etapas que faltam nas tarefas abertas da competência (modelo ganhou etapa, tarefa nova). */
export async function garantirEtapas(db: Db, competencia: string): Promise<number> {
  const tarefas = await buscarTudoPaginado<{ id: string; modelo_id: string }>((f, t) =>
    db.from("tarefas").select("id, modelo_id").eq("competencia", competencia).in("status", ["A_FAZER", "EM_ANDAMENTO"]).range(f, t),
  );
  const defs = await etapasDosModelos(db, [...new Set(tarefas.map((t) => t.modelo_id))]);
  const linhas = tarefas.flatMap((t) => (defs.get(t.modelo_id) ?? []).map((e) => ({ tarefa_id: t.id, etapa_id: e.id })));
  const novas = new Set<string>();
  for (const bloco of blocos(linhas, 1000)) {
    const { data, error } = await db
      .from("tarefa_etapas")
      .upsert(bloco, { onConflict: "tarefa_id,etapa_id", ignoreDuplicates: true })
      .select("tarefa_id");
    if (error) throw new Error(error.message);
    for (const r of data ?? []) novas.add(r.tarefa_id as string);
  }
  if (novas.size) await recalcularTarefas(db, [...novas]);
  return novas.size;
}

// --------------------------------------------------------- sincronização

export type ResultadoSync = { competencias: string[]; tarefas: number; etapas: number };

/**
 * Lê as centrais e conclui o que já foi feito nelas: tarefas inteiras (fonte
 * do modelo) e etapas (fonte da etapa). Só conclui — nunca reabre.
 */
export async function sincronizarAutomacoes(db: Db, competencias?: string[]): Promise<ResultadoSync> {
  if (!competencias) {
    const { data, error } = await db.from("tarefas").select("competencia").in("status", ["A_FAZER", "EM_ANDAMENTO"]).order("competencia", { ascending: false }).limit(5000);
    if (error) throw new Error(error.message);
    competencias = [...new Set((data ?? []).map((r) => r.competencia as string))].slice(0, 6);
  }
  let nTarefas = 0;
  let nEtapas = 0;
  for (const competencia of competencias) {
    await garantirEtapas(db, competencia);
    const abertas = await buscarTudoPaginado<{ id: string; modelo_id: string; company_id: string; tarefa_modelos: { fonte_automatica: string | null } | null }>(
      (f, t) =>
        db
          .from("tarefas")
          .select("id, modelo_id, company_id, tarefa_modelos(fonte_automatica)")
          .eq("competencia", competencia)
          .in("status", ["A_FAZER", "EM_ANDAMENTO"])
          .range(f, t) as unknown as PromiseLike<{ data: { id: string; modelo_id: string; company_id: string; tarefa_modelos: { fonte_automatica: string | null } | null }[] | null; error: { message: string } | null }>,
    );
    if (!abertas.length) continue;
    const defs = await etapasDosModelos(db, [...new Set(abertas.map((t) => t.modelo_id))]);
    const cache = new Map<string, Promise<Map<string, Resultado>>>();
    const fonte = (f: string) => {
      if (!(f in FONTES_ROTULO)) return Promise.resolve(new Map<string, Resultado>());
      let p = cache.get(f);
      if (!p) cache.set(f, (p = lerFonte(db, f as FonteAutomatica, competencia)));
      return p;
    };

    // 1) Tarefa inteira (modelo com fonte).
    const agora = new Date().toISOString();
    for (const t of abertas) {
      const f = t.tarefa_modelos?.fonte_automatica;
      if (!f) continue;
      const r = (await fonte(f)).get(t.company_id);
      if (!r) continue;
      const rotulo = FONTES_ROTULO[f as FonteAutomatica];
      const { error } = await db
        .from("tarefas")
        .update(
          r === "OK"
            ? { status: "CONCLUIDA", concluida_em: agora, concluida_por: null, concluida_por_fonte: rotulo, etapa_atual: null, aguardando_cliente: false }
            : { status: "NAO_SE_APLICA", comentario: `${rotulo} (dispensada)`, concluida_por_fonte: rotulo },
        )
        .eq("id", t.id)
        .in("status", ["A_FAZER", "EM_ANDAMENTO"]);
      if (error) throw new Error(error.message);
      await db.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "AUTOMATICO", para: r === "OK" ? "CONCLUIDA" : "NAO_SE_APLICA", comentario: rotulo });
      nTarefas++;
    }

    // 2) Etapas com fonte.
    const comEtapaAuto = abertas.filter((t) => !t.tarefa_modelos?.fonte_automatica && (defs.get(t.modelo_id) ?? []).some((e) => e.fonte_automatica));
    if (!comEtapaAuto.length) continue;
    const pendentes = new Map<string, Set<string>>();
    for (const ids of blocos(comEtapaAuto.map((t) => t.id))) {
      const { data, error } = await db.from("tarefa_etapas").select("tarefa_id, etapa_id").in("tarefa_id", ids).is("concluida_em", null);
      if (error) throw new Error(error.message);
      for (const r of data ?? []) {
        const s = pendentes.get(r.tarefa_id as string) ?? new Set<string>();
        s.add(r.etapa_id as string);
        pendentes.set(r.tarefa_id as string, s);
      }
    }
    const tocadas: string[] = [];
    for (const t of comEtapaAuto) {
      const pend = pendentes.get(t.id);
      if (!pend) continue;
      for (const e of defs.get(t.modelo_id) ?? []) {
        if (!e.fonte_automatica || !pend.has(e.id)) continue;
        const r = (await fonte(e.fonte_automatica)).get(t.company_id);
        if (!r) continue;
        const { error } = await db
          .from("tarefa_etapas")
          .update({ concluida_em: agora, automatica: true })
          .eq("tarefa_id", t.id)
          .eq("etapa_id", e.id)
          .is("concluida_em", null);
        if (error) throw new Error(error.message);
        nEtapas++;
        tocadas.push(t.id);
      }
    }
    if (tocadas.length) await recalcularTarefas(db, tocadas);
  }
  return { competencias, tarefas: nTarefas, etapas: nEtapas };
}
