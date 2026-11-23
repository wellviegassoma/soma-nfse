import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hojeBrasilia } from "@/lib/competencia";
import { carregarTarefas } from "./dados";
import { TarefasLista } from "./TarefasLista";

export const metadata = { title: "Minhas tarefas — Painel SOMA" };

/** Abertas do usuário (qualquer competência) + abertas sem responsável nos departamentos dele. */
export default async function MinhasTarefasPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: deptos } = await supabase
    .from("atendimento_usuario_departamentos")
    .select("departamento_id")
    .eq("user_id", user.id);
  const meusDeptos = (deptos ?? []).map((d) => d.departamento_id as string);
  const [minhas, semDono] = await Promise.all([
    carregarTarefas(supabase, { responsavelId: user.id, abertas: true }),
    meusDeptos.length
      ? carregarTarefas(supabase, { semResponsavel: true, abertas: true, departamentos: meusDeptos })
      : Promise.resolve({ linhas: [], equipe: [] }),
  ]);
  const hoje = hojeBrasilia();
  return (
    <div className="flex flex-col gap-8">
      <TarefasLista
        linhas={minhas.linhas}
        equipe={minhas.equipe}
        hoje={hoje}
        modo="minhas"
        meuId={user.id}
        vazio="Nenhuma tarefa aberta com você. 🎉"
      />
      {semDono.linhas.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Sem responsável nos seus departamentos</h2>
          <TarefasLista linhas={semDono.linhas} equipe={minhas.equipe} hoje={hoje} modo="painel" vazio="" />
        </section>
      )}
    </div>
  );
}
