import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia, mesCorrenteBrasilia } from "@/lib/competencia";
import { somarMeses } from "@/lib/tarefas-comum";
import { carregarTarefas } from "../../../tarefas/dados";
import { TarefasLista } from "../../../tarefas/TarefasLista";
import { NovaTarefaAvulsa } from "../../../tarefas/NovaTarefaAvulsa";

export const metadata = { title: "Tarefas da empresa — Painel SOMA" };

/** Tarefas da empresa: últimos 4 meses de competência (abertas e concluídas) + avulsas. */
export default async function TarefasEmpresaPage(props: PageProps<"/admin/empresas/[companyId]/tarefas">) {
  const { companyId } = await props.params;
  const atual = mesCorrenteBrasilia();
  const competencias = [0, 1, 2, 3, 4].map((n) => somarMeses(atual, -n));
  const { linhas, equipe } = await carregarTarefas(await createClient(), { companyId, competencias });
  const hoje = hojeBrasilia();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground/60">Tarefas da rotina e avulsas desta empresa nos últimos meses.</p>
        <NovaTarefaAvulsa hoje={hoje} companyId={companyId} />
      </div>
      <TarefasLista linhas={linhas} equipe={equipe} hoje={hoje} modo="painel" chave="empresa" vazio="Nenhuma tarefa desta empresa no período." />
    </div>
  );
}
