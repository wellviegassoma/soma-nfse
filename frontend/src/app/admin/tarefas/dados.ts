import "server-only";

import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe, nomeEmpresa } from "@/lib/tarefas";
import type { StatusTarefa } from "@/lib/tarefas-comum";
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
  tarefa_modelos: { nome: string; ordem: number } | null;
  companies: { legal_name: string; trade_name: string | null; codigo_cliente: string | null } | null;
  atendimento_departamentos: { nome: string } | null;
};

const COLUNAS =
  "id, modelo_id, company_id, competencia, departamento_id, responsavel_id, prazo_meta, prazo_legal, status, comentario, tarefa_modelos(nome, ordem), companies(legal_name, trade_name, codigo_cliente), atendimento_departamentos(nome)";

export async function carregarTarefas(
  db: Db,
  filtro: { competencia?: string; responsavelId?: string; abertas?: boolean; departamentos?: string[]; semResponsavel?: boolean },
): Promise<{ linhas: TarefaLinha[]; equipe: { id: string; nome: string }[] }> {
  const [brutas, equipe] = await Promise.all([
    buscarTudoPaginado<Bruta>((from, to) => {
      let q = db.from("tarefas").select(COLUNAS);
      if (filtro.competencia) q = q.eq("competencia", filtro.competencia);
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
    })),
  };
}
