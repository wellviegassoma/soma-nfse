import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { chaveObrigacao, itemRelevante } from "@/lib/agenda-tributaria";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import {
  MODELO_COLUNAS,
  carregarEmpresas,
  casaObrigacao,
  empresaAtendida,
  empresaNoFiltro,
  nomeEmpresa,
  type Modelo,
} from "@/lib/tarefas";
import { somarMeses } from "@/lib/tarefas-comum";
import { ModelosEditor, type Obrigacao } from "./ModelosEditor";

export const metadata = { title: "Modelos de tarefa — Painel SOMA" };

type ItemRow = { tipo: "TRIBUTO" | "DECLARACAO"; codigo: string | null; grupo: string | null; descricao: string; dia: number | null };

export default async function TarefaModelosPage() {
  await requireSuperAdmin();
  const supabase = await createClient();
  const competencia = mesAnteriorBrasilia();

  const [{ data: modelosRaw }, { data: deptos }, itens, empresas, excecoes, folha] = await Promise.all([
    supabase.from("tarefa_modelos").select(MODELO_COLUNAS).order("ordem").order("nome"),
    supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
    buscarTudoPaginado<ItemRow>((from, to) =>
      supabase
        .from("agenda_tributaria_itens")
        .select("tipo, codigo, grupo, descricao, dia")
        .order("mes", { ascending: false })
        .order("ordem")
        .range(from, to),
    ),
    carregarEmpresas(supabase),
    buscarTudoPaginado<{ modelo_id: string; company_id: string; tipo: "INCLUIR" | "EXCLUIR" }>((from, to) =>
      supabase.from("tarefa_modelo_excecoes").select("modelo_id, company_id, tipo").range(from, to),
    ),
    buscarTudoPaginado<{ company_id: string }>((from, to) =>
      supabase
        .from("folha_mensal")
        .select("company_id")
        .in("competencia", [competencia, somarMeses(competencia, -1), somarMeses(competencia, -2)])
        .gt("valor", 0)
        .range(from, to),
    ),
  ]);
  const modelos = (modelosRaw ?? []) as Modelo[];

  // Obrigações da agenda (a mais recente de cada), relevantes primeiro.
  const obrigacoes = new Map<string, Obrigacao>();
  for (const i of itens) {
    const chave = chaveObrigacao(i);
    if (obrigacoes.has(chave)) continue;
    obrigacoes.set(chave, {
      chave,
      rotulo: [i.codigo, i.grupo, i.descricao].filter(Boolean).join(" · ").slice(0, 140),
      relevante: itemRelevante(i),
    });
  }
  const listaObrigacoes = [...obrigacoes.values()].sort(
    (a, b) => Number(b.relevante) - Number(a.relevante) || a.rotulo.localeCompare(b.rotulo),
  );

  // Quantas empresas cada modelo pega hoje (competência que está fechando).
  const comFolha = new Set(folha.map((f) => f.company_id));
  const excecao = new Map(excecoes.map((x) => [`${x.modelo_id}|${x.company_id}`, x.tipo]));
  const atendidas = empresas.filter((e) => empresaAtendida(e, competencia));
  const alcance: Record<string, number> = {};
  const obrigacaoDoModelo: Record<string, string | null> = {};
  for (const m of modelos) {
    alcance[m.id] = atendidas.filter((e) => empresaNoFiltro(m, e, comFolha.has(e.id), excecao.get(`${m.id}|${e.id}`))).length;
    if (m.agenda_chave) {
      const item = itens.find((i) => casaObrigacao(i, m.agenda_chave!));
      obrigacaoDoModelo[m.id] = item ? [item.codigo, item.grupo, item.descricao].filter(Boolean).join(" · ").slice(0, 140) : null;
    }
  }

  const municipios = [
    ...new Map(
      empresas.filter((e) => e.municipality_ibge_code).map((e) => [e.municipality_ibge_code!, e.municipality_name ?? e.municipality_ibge_code!]),
    ).entries(),
  ]
    .map(([codigo, nome]) => ({ codigo, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Modelos de tarefa</h2>
        <p className="text-sm text-foreground/60">
          Cada modelo vira uma tarefa por empresa todo mês (a rotina roda todo dia e cria o que falta da competência
          que acabou de fechar). Só modelos <strong>ativos</strong> geram. Prazo pela agenda usa o vencimento da
          Receita e a meta SOMA da obrigação.
        </p>
      </div>
      <ModelosEditor
        modelos={modelos}
        departamentos={(deptos ?? []) as { id: string; nome: string }[]}
        obrigacoes={listaObrigacoes}
        municipios={municipios}
        empresas={empresas
          .filter((e) => e.ativa)
          .map((e) => ({ id: e.id, nome: nomeEmpresa(e) }))
          .sort((a, b) => a.nome.localeCompare(b.nome))}
        excecoes={excecoes}
        alcance={alcance}
        obrigacaoDoModelo={obrigacaoDoModelo}
        competenciaPadrao={competencia}
      />
    </div>
  );
}
