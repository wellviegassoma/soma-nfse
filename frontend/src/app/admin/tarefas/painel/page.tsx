import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/competencia";
import { competenciaDoParam, SeletorCompetencia } from "../Competencia";
import { carregarTarefas } from "../dados";
import { TarefasLista } from "../TarefasLista";

export const metadata = { title: "Painel de tarefas — Painel SOMA" };

export default async function PainelTarefasPage(props: PageProps<"/admin/tarefas/painel">) {
  const sp = await props.searchParams;
  const competencia = competenciaDoParam(sp.competencia);
  const { linhas, equipe } = await carregarTarefas(await createClient(), { competencia });
  return (
    <div className="flex flex-col gap-4">
      <SeletorCompetencia competencia={competencia} base="/admin/tarefas/painel" />
      <TarefasLista
        key={competencia}
        linhas={linhas}
        equipe={equipe}
        hoje={hojeBrasilia()}
        modo="painel"
        vazio="Nenhuma tarefa gerada nessa competência. Ative modelos em Configurações › Modelos de tarefa."
      />
    </div>
  );
}
