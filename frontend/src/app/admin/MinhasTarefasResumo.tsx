import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { hojeBrasilia } from "@/lib/competencia";
import { SITUACAO_CLASSE, SITUACAO_ROTULO, situacaoTarefa, type Situacao, type StatusTarefa } from "@/lib/tarefas-comum";
import { cn } from "@/lib/cn";

type SupabaseServer = Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;

const MOSTRAR: Situacao[] = ["RISCO", "ATRASADA", "HOJE", "SEMANA"];

/**
 * Faixa "Minhas tarefas" da Visão geral: só contagens das abertas do
 * usuário (uma consulta enxuta, em <Suspense>). Some quando não há nada urgente.
 */
export async function MinhasTarefasResumo({ supabase }: { supabase: SupabaseServer }) {
  const user = await requireUser();
  const { data } = await supabase
    .from("tarefas")
    .select("status, prazo_meta, prazo_legal")
    .eq("responsavel_id", user.id)
    .in("status", ["A_FAZER", "EM_ANDAMENTO"])
    .limit(1000);
  const hoje = hojeBrasilia();
  const cont = new Map<Situacao, number>();
  for (const t of (data ?? []) as { status: StatusTarefa; prazo_meta: string | null; prazo_legal: string | null }[]) {
    const s = situacaoTarefa(t, hoje);
    cont.set(s, (cont.get(s) ?? 0) + 1);
  }
  const itens = MOSTRAR.filter((s) => cont.get(s));
  if (!itens.length) return null;
  return (
    <Link
      href="/admin/tarefas"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 shadow-sm hover:bg-surface-muted"
    >
      <span className="mr-1 text-sm font-semibold text-foreground">Minhas tarefas</span>
      {itens.map((s) => (
        <span key={s} className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", SITUACAO_CLASSE[s])}>
          {SITUACAO_ROTULO[s]} <strong>{cont.get(s)}</strong>
        </span>
      ))}
      <span className="ml-auto text-xs text-brand">Abrir →</span>
    </Link>
  );
}
