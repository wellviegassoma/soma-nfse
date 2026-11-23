import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { carregarEmpresas, listarEquipe, nomeEmpresa } from "@/lib/tarefas";
import { REGIMES } from "@/lib/tarefas-comum";
import { CarteiraGrade } from "./CarteiraGrade";

export const metadata = { title: "Carteira — Painel SOMA" };

export default async function CarteiraPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const [empresas, equipe, { data: deptos }, { data: modelos }, carteira] = await Promise.all([
    carregarEmpresas(supabase),
    listarEquipe(),
    supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("tarefa_modelos").select("departamento_id"),
    buscarTudoPaginado<{ company_id: string; departamento_id: string; user_id: string }>((from, to) =>
      supabase.from("tarefa_responsaveis").select("company_id, departamento_id, user_id").range(from, to),
    ),
  ]);
  // Colunas: departamentos que têm modelo de tarefa (os demais não geram nada).
  const comModelo = new Set((modelos ?? []).map((m) => m.departamento_id as string));
  const colunas = ((deptos ?? []) as { id: string; nome: string }[]).filter((d) => comModelo.has(d.id));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Carteira</h2>
        <p className="text-sm text-foreground/60">
          Responsável de cada empresa por departamento. As tarefas novas já nascem com ele; trocar aqui passa também as
          tarefas abertas daquela empresa e departamento.
        </p>
      </div>
      <CarteiraGrade
        empresas={empresas
          .filter((e) => e.ativa)
          .map((e) => ({
            id: e.id,
            nome: nomeEmpresa(e),
            pessoa: e.person_type,
            regime: REGIMES.find((r) => r.valor === e.tax_regime)?.rotulo ?? null,
            municipio: e.municipality_name,
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome))}
        departamentos={colunas}
        equipe={equipe}
        carteira={carteira}
      />
    </div>
  );
}
