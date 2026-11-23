import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe, nomeEmpresa } from "@/lib/tarefas";
import { IBGE_PETROPOLIS, IBGE_RIO, type StatusTarefa, type Verificacao } from "@/lib/tarefas-comum";
import type { TarefaLinha } from "./TarefasLista";

type Db = Awaited<ReturnType<typeof createClient>>;

type Bruta = {
  id: string;
  modelo_id: string;
  company_id: string;
  competencia: string;
  departamento_id: string;
  responsavel_id: string | null;
  prazo_meta: string | null;
  prazo_legal: string | null;
  status: StatusTarefa;
  comentario: string | null;
  aguardando_cliente: boolean;
  etapa_atual: number | null;
  concluida_por_fonte: string | null;
  tarefa_modelos: { nome: string; ordem: number } | null;
  companies: { legal_name: string; trade_name: string | null; codigo_cliente: string | null; municipality_ibge_code: string | null } | null;
  atendimento_departamentos: { nome: string } | null;
};

const COLUNAS =
  "id, modelo_id, company_id, competencia, departamento_id, responsavel_id, prazo_meta, prazo_legal, status, comentario, aguardando_cliente, etapa_atual, concluida_por_fonte, tarefa_modelos(nome, ordem), companies(legal_name, trade_name, codigo_cliente, municipality_ibge_code), atendimento_departamentos(nome)";

export async function carregarTarefas(
  db: Db,
  filtro: { competencia?: string; modeloId?: string; responsavelId?: string; abertas?: boolean; departamentos?: string[]; semResponsavel?: boolean },
): Promise<{ linhas: TarefaLinha[]; equipe: { id: string; nome: string }[] }> {
  const [brutas, equipe] = await Promise.all([
    buscarTudoPaginado<Bruta>((from, to) => {
      let q = db.from("tarefas").select(COLUNAS);
      if (filtro.competencia) q = q.eq("competencia", filtro.competencia);
      if (filtro.modeloId) q = q.eq("modelo_id", filtro.modeloId);
      if (filtro.responsavelId) q = q.eq("responsavel_id", filtro.responsavelId);
      if (filtro.semResponsavel) q = q.is("responsavel_id", null);
      if (filtro.departamentos) q = q.in("departamento_id", filtro.departamentos);
      if (filtro.abertas) q = q.in("status", ["A_FAZER", "EM_ANDAMENTO"]);
      return q.order("prazo_meta", { nullsFirst: false }).order("id").range(from, to) as unknown as PromiseLike<{
        data: Bruta[] | null;
        error: { message: string } | null;
      }>;
    }),
    listarEquipe(),
  ]);
  const nome = new Map(equipe.map((u) => [u.id, u.nome]));
  // Etapas dos modelos presentes (poucas linhas): nome da etapa atual e "2/4".
  const modeloIds = [...new Set(brutas.map((t) => t.modelo_id))];
  const { data: defs } = modeloIds.length
    ? await db.from("tarefa_modelo_etapas").select("modelo_id, ordem, nome, fonte_automatica").in("modelo_id", modeloIds).order("ordem")
    : { data: [] as { modelo_id: string; ordem: number; nome: string; fonte_automatica: string | null }[] };
  const etapasPorModelo = new Map<string, { ordem: number; nome: string; fonte_automatica: string | null }[]>();
  for (const e of (defs ?? []) as { modelo_id: string; ordem: number; nome: string; fonte_automatica: string | null }[]) {
    const arr = etapasPorModelo.get(e.modelo_id) ?? [];
    arr.push(e);
    etapasPorModelo.set(e.modelo_id, arr);
  }
  return {
    equipe,
    linhas: brutas.map((t) => ({
      id: t.id,
      modelo_id: t.modelo_id,
      modelo: t.tarefa_modelos?.nome ?? "—",
      ordem: t.tarefa_modelos?.ordem ?? 0,
      company_id: t.company_id,
      empresa: t.companies ? nomeEmpresa(t.companies) : "—",
      competencia: t.competencia,
      departamento_id: t.departamento_id,
      departamento: t.atendimento_departamentos?.nome ?? "—",
      responsavel_id: t.responsavel_id,
      responsavel: t.responsavel_id ? nome.get(t.responsavel_id) ?? "—" : null,
      prazo_meta: t.prazo_meta,
      prazo_legal: t.prazo_legal,
      status: t.status,
      comentario: t.comentario,
      aguardando_cliente: t.aguardando_cliente,
      concluida_por_fonte: t.concluida_por_fonte,
      ...etapaInfo(etapasPorModelo.get(t.modelo_id) ?? [], t.etapa_atual),
      verificacao: verificacaoDe(etapasPorModelo.get(t.modelo_id) ?? [], t.companies?.municipality_ibge_code ?? null),
    })),
  };
}

/** Tarefa com etapa de pagamento ⇒ botão "Verificar pagamento" na central certa. */
function verificacaoDe(etapas: { fonte_automatica: string | null }[], ibge: string | null): Verificacao | null {
  if (etapas.some((e) => e.fonte_automatica === "DAS_PAGO")) return "DAS";
  if (etapas.some((e) => e.fonte_automatica === "ISS_PAGO")) {
    if (ibge === IBGE_RIO) return "ISS_RIO";
    if (ibge === IBGE_PETROPOLIS) return "ISS_PETROPOLIS";
  }
  return null;
}

function etapaInfo(etapas: { ordem: number; nome: string }[], atual: number | null) {
  if (!etapas.length) return { etapas_total: 0, etapa_indice: 0, etapa_nome: null };
  const i = atual == null ? -1 : etapas.findIndex((e) => e.ordem === atual);
  return {
    etapas_total: etapas.length,
    etapa_indice: i < 0 ? etapas.length : i, // quantas já foram
    etapa_nome: i < 0 ? null : etapas[i].nome,
  };
}
