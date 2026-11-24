import "server-only";

// Serena — partes que rodam sem usuário logado (cron diário) e também pelos
// botões da tela: conferência com a Prefeitura de Petrópolis, escalonamento
// para os revisores e a rodada automática do dia.
//
// A rodada automática só faz o que é seguro: consultar a prefeitura e revisar
// com IA. Transmitir PGDAS, gerar DAS e mandar mensagem continuam com clique.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarFaturamentoMensal, somarFaturamento, somarReceitaExportacao } from "@/lib/faturamento";
import { consultarFaturamentoPetropolis } from "@/lib/iss-petropolis";
import { revisarComIa, type ResultadoRevisao } from "@/lib/serena-revisor";
import { carregarEsteira } from "@/lib/serena";
import { IBGE_PETROPOLIS, rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";

type Db = SupabaseClient;

export async function revisoresConfig(db: Db): Promise<string[]> {
  const { data } = await db.from("serena_config").select("valor").eq("chave", "revisores").maybeSingle();
  return Array.isArray(data?.valor) ? (data!.valor as string[]) : [];
}

/** Mesma conferência do botão "Conferir prefeitura" (só consulta), sem exigir usuário. */
export async function conferirPetropolis(db: Db, companyId: string, competencia: string, userId: string | null) {
  const [consulta, notas] = await Promise.all([consultarFaturamentoPetropolis(db, companyId, competencia), buscarFaturamentoMensal(db, companyId)]);
  const valorNotas = somarFaturamento(notas, [competencia]) - somarReceitaExportacao(notas, [competencia]);
  await db.from("conferencia_prefeitura").upsert(
    {
      company_id: companyId,
      competencia,
      valor_prefeitura: consulta.ok ? consulta.valorServicos : null,
      valor_notas: valorNotas,
      erro: consulta.ok ? null : consulta.erro,
      consultado_em: new Date().toISOString(),
      consultado_por: userId,
    },
    { onConflict: "company_id,competencia" },
  );
  return consulta.ok;
}

/**
 * Casos ESCALAR viram tarefa avulsa para o revisor com menos tarefas da Serena
 * em aberto; se a empresa já tem tarefa na competência, só comenta nela.
 */
export async function escalarParaRevisores(db: Db, competencia: string, resultados: ResultadoRevisao[]) {
  const escalar = resultados.filter((r) => r.decisao === "ESCALAR");
  if (!escalar.length) return;
  const revisores = await revisoresConfig(db);
  const carga = new Map(revisores.map((id) => [id, 0]));
  if (revisores.length) {
    const { data: abertas } = await db
      .from("tarefas")
      .select("responsavel_id")
      .like("titulo", "Serena:%")
      .in("status", ["A_FAZER", "EM_ANDAMENTO"])
      .in("responsavel_id", revisores);
    for (const t of abertas ?? []) carga.set(t.responsavel_id as string, (carga.get(t.responsavel_id as string) ?? 0) + 1);
  }
  const { data: dep } = await db.from("atendimento_departamentos").select("id").eq("nome", "Fiscal").maybeSingle();

  for (const r of escalar) {
    const { data: f } = await db
      .from("serena_fechamentos")
      .select("tarefa_id, ia_diagnostico, ia_acoes")
      .eq("company_id", r.companyId)
      .eq("competencia", competencia)
      .maybeSingle();
    if (f?.tarefa_id) {
      await db.from("tarefa_eventos").insert({ tarefa_id: f.tarefa_id, tipo: "COMENTARIO", comentario: `Serena: ${f.ia_diagnostico ?? r.pergunta ?? r.justificativa}` });
      continue;
    }
    const responsavel = revisores.length ? [...carga.entries()].sort((a, b) => a[1] - b[1])[0][0] : null;
    if (responsavel) carga.set(responsavel, (carga.get(responsavel) ?? 0) + 1);
    const acoes = Array.isArray(f?.ia_acoes) ? (f!.ia_acoes as { acao: string; onde: string }[]) : [];
    const { data: t, error } = await db
      .from("tarefas")
      .insert({
        modelo_id: null,
        titulo: `Serena: revisar Simples ${rotuloCompetencia(competencia)}`,
        descricao: [
          r.pergunta ?? r.justificativa,
          f?.ia_diagnostico ? `Diagnóstico da Serena: ${f.ia_diagnostico}` : `Análise da Serena: ${r.justificativa}`,
          acoes.length ? `O que fazer:\n${acoes.map((a) => `- ${a.acao} (${a.onde})`).join("\n")}` : null,
          'Depois de corrigir, rode "Serena revisar" de novo ou aprove na Central do Simples — a Serena segue sozinha.',
        ]
          .filter(Boolean)
          .join("\n\n"),
        company_id: r.companyId,
        competencia,
        departamento_id: dep?.id,
        responsavel_id: responsavel,
        prazo_meta: `${somarMeses(competencia, 1)}-12`,
        prazo_legal: `${somarMeses(competencia, 1)}-20`,
      })
      .select("id")
      .single();
    if (!error && t) {
      await db.from("serena_fechamentos").update({ tarefa_id: t.id, escalado_para: responsavel }).eq("company_id", r.companyId).eq("competencia", competencia);
      await db.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "CRIADA", comentario: "Serena" });
    }
  }
}

export type ResumoRotina = {
  em: string;
  competencia: string;
  conferidas: number;
  revisadas: number;
  aprovadas: number;
  escaladas: number;
  faltamRevisar: number;
  custoUsd: number;
  erro?: string;
};

/**
 * Rodada automática do dia: confere Petrópolis de quem ainda não foi
 * conferido e revisa com IA quem está em "Revisar" sem decisão para o
 * cálculo atual. Limites por rodada para caber no tempo da função; o que
 * sobrar fica para a próxima rodada (ou para o botão).
 */
export async function rodarRotinaSerena(
  db: Db,
  competencia: string,
  limites = { conferencias: 30, revisoes: 10 },
  etapa: "motor" | "ia" | "tudo" = "tudo",
): Promise<ResumoRotina> {
  const resumo: ResumoRotina = { em: new Date().toISOString(), competencia, conferidas: 0, revisadas: 0, aprovadas: 0, escaladas: 0, faltamRevisar: 0, custoUsd: 0 };
  try {
    // 1. Prefeitura de Petrópolis (só quem ainda não tem conferência no mês).
    let linhas = await carregarEsteira(db, competencia);
    const { data: conf } = await db.from("conferencia_prefeitura").select("company_id").eq("competencia", competencia);
    const jaConferidas = new Set((conf ?? []).map((c) => c.company_id as string));
    const { data: munis } = await db.from("companies").select("id, municipality_ibge_code").in("id", linhas.map((l) => l.id));
    const ehPetropolis = new Set((munis ?? []).filter((m) => m.municipality_ibge_code === IBGE_PETROPOLIS).map((m) => m.id as string));
    const paraConferir = etapa === "ia" ? [] : linhas.filter((l) => ehPetropolis.has(l.id) && !jaConferidas.has(l.id) && !l.declarada).slice(0, limites.conferencias);
    for (const l of paraConferir) {
      if (await conferirPetropolis(db, l.id, competencia, null).catch(() => false)) resumo.conferidas++;
    }
    if (paraConferir.length) linhas = await carregarEsteira(db, competencia);

    // 2. Revisão com IA de quem está em "Revisar" sem decisão atual.
    const candidatas = linhas.filter(
      (l) => l.conferencia === "REVISAR" && !l.aprovada && !(l.serena?.ia_decisao && l.serena.ia_assinatura === l.assinatura),
    );
    const agora = etapa === "motor" ? [] : candidatas.slice(0, limites.revisoes);
    resumo.faltamRevisar = candidatas.length - agora.length;
    for (let i = 0; i < agora.length; i += 4) {
      const res = await revisarComIa(db, competencia, agora.slice(i, i + 4).map((l) => l.id));
      // Sem tarefa em Tarefas (pedido do Wellington, 24/11): o caso fica na tela, em "Precisa de ação".
      for (const r of res) {
        resumo.revisadas++;
        resumo.custoUsd += r.custoUsd ?? 0;
        if (r.decisao === "APROVAR") resumo.aprovadas++;
        else resumo.escaladas++;
      }
    }
  } catch (e) {
    resumo.erro = e instanceof Error ? e.message : String(e);
  }
  // Guarda a última rodada de cada etapa (a tela mostra as duas).
  const { data: ant } = await db.from("serena_config").select("valor").eq("chave", "ultima_rotina").maybeSingle();
  const anterior = (ant?.valor ?? {}) as Partial<ResumoRotina>;
  const valor: ResumoRotina =
    etapa === "motor"
      ? { ...resumo, revisadas: anterior.revisadas ?? 0, aprovadas: anterior.aprovadas ?? 0, escaladas: anterior.escaladas ?? 0, custoUsd: anterior.custoUsd ?? 0 }
      : etapa === "ia"
        ? { ...resumo, conferidas: anterior.conferidas ?? 0 }
        : resumo;
  await db.from("serena_config").upsert({ chave: "ultima_rotina", valor, atualizado_em: new Date().toISOString() });
  return resumo;
}
