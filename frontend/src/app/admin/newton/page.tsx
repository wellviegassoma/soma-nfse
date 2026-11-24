import { createClient } from "@/lib/supabase/server";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarEsteiraNewton } from "@/lib/newton";
import { listarEquipe } from "@/lib/tarefas";
import { revisoresNewton, type ResumoRotinaNewton } from "@/lib/newton-rotina";
import { NewtonPainel } from "./NewtonPainel";
import { SerenaChat } from "../serena/SerenaChat";

export const metadata = { title: "Newton — Lucro Presumido" };
export const maxDuration = 300;

const COMPETENCIA = /^\d{4}-\d{2}$/;
// O Newton assume a partir de novembro/2026; antes disso a equipe declarou
// por fora (prova de outubro) — a tela fica só para consulta.
const INICIO_NEWTON = "2026-11";

/**
 * Newton: carteira de IA do Lucro Presumido (Petrópolis + Rio). Mesma lógica
 * da Serena: esteira de cada empresa no mês e ações em lote, na ordem.
 */
export default async function NewtonPage(props: PageProps<"/admin/newton">) {
  const sp = await props.searchParams;
  const competencia = typeof sp.competencia === "string" && COMPETENCIA.test(sp.competencia) ? sp.competencia : mesAnteriorBrasilia();
  const supabase = await createClient();
  const [linhas, equipe, revisores, { data: rotina }] = await Promise.all([
    carregarEsteiraNewton(supabase, competencia),
    listarEquipe(),
    revisoresNewton(supabase),
    supabase.from("serena_config").select("valor").eq("chave", "newton_ultima_rotina").maybeSingle(),
  ]);
  return (
    <>
    <SerenaChat analista="NEWTON" />
    <NewtonPainel
      competencia={competencia}
      linhas={linhas}
      equipe={equipe}
      revisores={revisores}
      ultimaRotina={(rotina?.valor as ResumoRotinaNewton | undefined) ?? null}
      somenteLeitura={competencia < INICIO_NEWTON}
    />
    </>
  );
}
