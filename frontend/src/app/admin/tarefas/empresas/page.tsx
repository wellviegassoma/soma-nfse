import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/competencia";
import { competenciaDoParam, SeletorCompetencia } from "../Competencia";
import { carregarTarefas } from "../dados";
import { GradeEmpresas } from "./GradeEmpresas";

export const metadata = { title: "Tarefas por empresa — Painel SOMA" };

export default async function TarefasPorEmpresaPage(props: PageProps<"/admin/tarefas/empresas">) {
  const sp = await props.searchParams;
  const competencia = competenciaDoParam(sp.competencia);
  const { linhas } = await carregarTarefas(await createClient(), { competencia });
  return (
    <div className="flex flex-col gap-4">
      <SeletorCompetencia competencia={competencia} base="/admin/tarefas/empresas" />
      <GradeEmpresas key={competencia} linhas={linhas} hoje={hojeBrasilia()} />
    </div>
  );
}
