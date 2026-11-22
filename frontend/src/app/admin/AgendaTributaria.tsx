import { Card } from "@/components/ui/Card";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { chaveObrigacao, dataMeta, itemRelevante } from "@/lib/agenda-tributaria";
import { hojeBrasilia, mesCorrenteBrasilia, proximaCompetencia } from "@/lib/competencia";
import { AgendaTributariaLista, type AgendaLinha } from "./AgendaTributariaLista";

type SupabaseServer = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

export type AgendaDados = {
  mes: string;
  info: { ade: string | null; fonte_url: string | null; origem: string; importado_em: string } | null;
  linhas: AgendaLinha[];
  erro: string | null;
};

const MES_REGEX = /^\d{4}-\d{2}$/;

export function mesAgendaDoParam(v: string | string[] | undefined): string {
  return typeof v === "string" && MES_REGEX.test(v) ? v : mesCorrenteBrasilia();
}

/**
 * Uma consulta só do mês escolhido (~310 linhas, colunas enxutas). Chamada
 * no começo da página e resolvida dentro de um <Suspense>, para a agenda não
 * atrasar os indicadores da Visão geral.
 */
export async function carregarAgenda(supabase: SupabaseServer, mes: string): Promise<AgendaDados> {
  try {
    const [{ data: info, error }, itens, { data: metas, error: erroMetas }] = await Promise.all([
      supabase
        .from("agenda_tributaria_meses")
        .select("ade, fonte_url, origem, importado_em")
        .eq("mes", `${mes}-01`)
        .maybeSingle(),
      buscarTudoPaginado<Omit<AgendaLinha, "relevante" | "meta">>((from, to) =>
        supabase
          .from("agenda_tributaria_itens")
          .select("id, tipo, dia, dia_texto, vencimento, codigo, grupo, descricao, periodo, documento")
          .eq("mes", `${mes}-01`)
          .order("ordem")
          .range(from, to),
      ),
      // Metas SOMA (Configurações): poucas linhas, uma por obrigação.
      supabase.from("agenda_tributaria_metas").select("chave, dia_meta, observacao"),
    ]);
    if (error) throw new Error(error.message);
    if (erroMetas) throw new Error(erroMetas.message);
    const metaPorChave = new Map((metas ?? []).map((m) => [m.chave, m]));
    return {
      mes,
      info,
      linhas: itens.map((i) => {
        const m = metaPorChave.get(chaveObrigacao(i));
        const data = m ? dataMeta(i.vencimento, m.dia_meta) : null;
        return {
          ...i,
          relevante: itemRelevante(i),
          meta: data ? { data, observacao: m!.observacao } : null,
        };
      }),
      erro: null,
    };
  } catch (e) {
    return { mes, info: null, linhas: [], erro: e instanceof Error ? e.message : String(e) };
  }
}

function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export async function AgendaTributariaBloco({
  dados,
  searchParams,
}: {
  dados: Promise<AgendaDados>;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const d = await dados;
  const href = (mes: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && k !== "agenda") p.set(k, v);
    p.set("agenda", mes);
    return `/admin?${p.toString()}#agenda-tributaria`;
  };
  return (
    <AgendaTributariaLista
      key={d.mes}
      mes={d.mes}
      hoje={hojeBrasilia()}
      info={d.info}
      linhas={d.linhas}
      erro={d.erro}
      hrefAnterior={href(mesAnterior(d.mes))}
      hrefProximo={href(proximaCompetencia(d.mes))}
      hrefAtual={href(mesCorrenteBrasilia())}
    />
  );
}

export function AgendaTributariaCarregando() {
  return (
    <Card className="p-5">
      <div className="text-sm font-semibold text-foreground/70">Agenda tributária</div>
      <div className="mt-3 h-24 animate-pulse rounded-lg bg-surface-muted" />
    </Card>
  );
}
