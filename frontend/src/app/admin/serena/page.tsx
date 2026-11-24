import { createClient } from "@/lib/supabase/server";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarEsteira } from "@/lib/serena";
import { listarEquipe } from "@/lib/tarefas";
import { revisoresSerena } from "@/lib/actions/serena";
import { SerenaPainel } from "./SerenaPainel";

export const metadata = { title: "Serena — Simples Nacional" };
export const maxDuration = 300;

const COMPETENCIA = /^\d{4}-\d{2}$/;

/**
 * Serena: carteira de IA do Simples Nacional (Petrópolis + Rio). Mostra a
 * esteira de cada empresa no mês e as ações em lote para levar todas até o
 * fim. Desenho: docs/simples-operacao-automatica.md.
 */
export default async function SerenaPage(props: PageProps<"/admin/serena">) {
  const sp = await props.searchParams;
  const competencia = typeof sp.competencia === "string" && COMPETENCIA.test(sp.competencia) ? sp.competencia : mesAnteriorBrasilia();
  const supabase = await createClient();
  const [linhas, equipe, revisores] = await Promise.all([carregarEsteira(supabase, competencia), listarEquipe(), revisoresSerena()]);
  return <SerenaPainel competencia={competencia} linhas={linhas} equipe={equipe} revisores={revisores} />;
}
