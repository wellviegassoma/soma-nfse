import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/competencia";
import { cn } from "@/lib/cn";
import { competenciaDoParam, SeletorCompetencia } from "../Competencia";
import { carregarTarefas } from "../dados";
import { Quadro } from "./Quadro";

export const metadata = { title: "Quadro de tarefas — Painel SOMA" };

export default async function QuadroTarefasPage(props: PageProps<"/admin/tarefas/quadro">) {
  const sp = await props.searchParams;
  const competencia = competenciaDoParam(sp.competencia);
  const supabase = await createClient();

  // Modelos com tarefa na competência (abas do quadro).
  const { data: presentes } = await supabase
    .from("tarefas")
    .select("modelo_id, tarefa_modelos(nome, ordem)")
    .eq("competencia", competencia)
    .limit(10000);
  const modelos = [
    ...new Map(
      ((presentes ?? []) as unknown as { modelo_id: string; tarefa_modelos: { nome: string; ordem: number } | null }[]).map((p) => [
        p.modelo_id,
        { id: p.modelo_id, nome: p.tarefa_modelos?.nome ?? "—", ordem: p.tarefa_modelos?.ordem ?? 0 },
      ]),
    ).values(),
  ].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const modeloId = typeof sp.modelo === "string" && modelos.some((m) => m.id === sp.modelo) ? sp.modelo : modelos[0]?.id;

  const [{ linhas }, { data: etapas }] = modeloId
    ? await Promise.all([
        carregarTarefas(supabase, { competencia, modeloId }),
        supabase.from("tarefa_modelo_etapas").select("ordem, nome, depende_do_cliente").eq("modelo_id", modeloId).order("ordem"),
      ])
    : [{ linhas: [] }, { data: [] }];

  return (
    <div className="flex flex-col gap-4">
      <SeletorCompetencia competencia={competencia} base={`/admin/tarefas/quadro`} />
      {modelos.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-sm text-foreground/60">Nenhuma tarefa nessa competência.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {modelos.map((m) => (
              <Link
                key={m.id}
                href={`/admin/tarefas/quadro?competencia=${competencia}&modelo=${m.id}`}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm",
                  m.id === modeloId ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-foreground/70 hover:bg-surface-muted",
                )}
              >
                {m.nome}
              </Link>
            ))}
          </div>
          <Quadro
            key={`${competencia}-${modeloId}`}
            linhas={linhas}
            etapas={(etapas ?? []) as { ordem: number; nome: string; depende_do_cliente: boolean }[]}
            hoje={hojeBrasilia()}
          />
        </>
      )}
    </div>
  );
}
