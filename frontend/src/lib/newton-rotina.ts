import "server-only";

// Newton — partes que rodam sem usuário (cron) e pelos botões: escalonamento
// para os revisores e a rodada automática do dia. Só faz o que é seguro:
// conferir a prefeitura (consulta) e revisar com IA. Encerrar o MIT,
// transmitir a DCTFWeb, gerar DARF e mandar mensagem continuam com clique.

import type { SupabaseClient } from "@supabase/supabase-js";
import { conferirPetropolis } from "@/lib/serena-rotina";
import { revisarComIaNewton, type ResultadoRevisaoNewton } from "@/lib/newton-revisor";
import { carregarEsteiraNewton } from "@/lib/newton";
import { rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";

type Db = SupabaseClient;

export async function revisoresNewton(db: Db): Promise<string[]> {
  const { data } = await db.from("serena_config").select("valor").eq("chave", "newton_revisores").maybeSingle();
  if (Array.isArray(data?.valor)) return data!.valor as string[];
  // Sem configuração própria: os mesmos revisores da Serena (Paulo e Douglas).
  const { data: s } = await db.from("serena_config").select("valor").eq("chave", "revisores").maybeSingle();
  return Array.isArray(s?.valor) ? (s!.valor as string[]) : [];
}

/** ESCALAR vira tarefa avulsa para o revisor com menos tarefas do Newton em aberto. */
export async function escalarNewton(db: Db, competencia: string, resultados: ResultadoRevisaoNewton[]) {
  const escalar = resultados.filter((r) => r.decisao === "ESCALAR");
  if (!escalar.length) return;
  const revisores = await revisoresNewton(db);
  const carga = new Map(revisores.map((id) => [id, 0]));
  if (revisores.length) {
    const { data: abertas } = await db
      .from("tarefas")
      .select("responsavel_id")
      .like("titulo", "Newton:%")
      .in("status", ["A_FAZER", "EM_ANDAMENTO"])
      .in("responsavel_id", revisores);
    for (const t of abertas ?? []) carga.set(t.responsavel_id as string, (carga.get(t.responsavel_id as string) ?? 0) + 1);
  }
  const { data: dep } = await db.from("atendimento_departamentos").select("id").eq("nome", "Fiscal").maybeSingle();
  for (const r of escalar) {
    const { data: f } = await db.from("newton_fechamentos").select("tarefa_id, ia_diagnostico, ia_acoes").eq("company_id", r.companyId).eq("competencia", competencia).maybeSingle();
    if (f?.tarefa_id) {
      await db.from("tarefa_eventos").insert({ tarefa_id: f.tarefa_id, tipo: "COMENTARIO", comentario: `Newton: ${f.ia_diagnostico ?? r.pergunta ?? r.justificativa}` });
      continue;
    }
    const responsavel = revisores.length ? [...carga.entries()].sort((a, b) => a[1] - b[1])[0][0] : null;
    if (responsavel) carga.set(responsavel, (carga.get(responsavel) ?? 0) + 1);
    const acoes = Array.isArray(f?.ia_acoes) ? (f!.ia_acoes as { acao: string; onde: string }[]) : [];
    const { data: t, error } = await db
      .from("tarefas")
      .insert({
        modelo_id: null,
        titulo: `Newton: revisar Lucro Presumido ${rotuloCompetencia(competencia)}`,
        descricao: [
          r.pergunta ?? r.justificativa,
          f?.ia_diagnostico ? `Diagnóstico do Newton: ${f.ia_diagnostico}` : `Análise do Newton: ${r.justificativa}`,
          acoes.length ? `O que fazer:\n${acoes.map((a) => `- ${a.acao} (${a.onde})`).join("\n")}` : null,
          'Depois de corrigir, rode "Newton revisar" de novo ou aprove na tela do Newton — ele segue sozinho.',
        ]
          .filter(Boolean)
          .join("\n\n"),
        company_id: r.companyId,
        competencia,
        departamento_id: dep?.id,
        responsavel_id: responsavel,
        prazo_meta: `${somarMeses(competencia, 1)}-18`,
        prazo_legal: `${somarMeses(competencia, 1)}-25`,
      })
      .select("id")
      .single();
    if (!error && t) {
      await db.from("newton_fechamentos").update({ tarefa_id: t.id, escalado_para: responsavel }).eq("company_id", r.companyId).eq("competencia", competencia);
      await db.from("tarefa_eventos").insert({ tarefa_id: t.id, tipo: "CRIADA", comentario: "Newton" });
    }
  }
}

export type ResumoRotinaNewton = {
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

export async function rodarRotinaNewton(
  db: Db,
  competencia: string,
  limites = { conferencias: 20, revisoes: 8 },
  etapa: "motor" | "ia" | "tudo" = "tudo",
): Promise<ResumoRotinaNewton> {
  const resumo: ResumoRotinaNewton = { em: new Date().toISOString(), competencia, conferidas: 0, revisadas: 0, aprovadas: 0, escaladas: 0, faltamRevisar: 0, custoUsd: 0 };
  try {
    let linhas = await carregarEsteiraNewton(db, competencia);
    const { data: conf } = await db.from("conferencia_prefeitura").select("company_id").eq("competencia", competencia);
    const ja = new Set((conf ?? []).map((c) => c.company_id as string));
    const paraConferir = etapa === "ia" ? [] : linhas.filter((l) => l.municipio === "Petrópolis" && !ja.has(l.id) && !l.mitEncerrado).slice(0, limites.conferencias);
    for (const l of paraConferir) if (await conferirPetropolis(db, l.id, competencia, null).catch(() => false)) resumo.conferidas++;
    if (paraConferir.length) linhas = await carregarEsteiraNewton(db, competencia);

    const candidatas = linhas.filter((l) => l.conferencia === "REVISAR" && !l.aprovada && !(l.newton?.ia_decisao && l.newton.ia_assinatura === l.assinatura));
    const agora = etapa === "motor" ? [] : candidatas.slice(0, limites.revisoes);
    resumo.faltamRevisar = candidatas.length - agora.length;
    for (let i = 0; i < agora.length; i += 4) {
      const res = await revisarComIaNewton(db, competencia, agora.slice(i, i + 4).map((l) => l.id));
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
  const { data: ant } = await db.from("serena_config").select("valor").eq("chave", "newton_ultima_rotina").maybeSingle();
  const anterior = (ant?.valor ?? {}) as Partial<ResumoRotinaNewton>;
  const valor =
    etapa === "motor"
      ? { ...resumo, revisadas: anterior.revisadas ?? 0, aprovadas: anterior.aprovadas ?? 0, escaladas: anterior.escaladas ?? 0, custoUsd: anterior.custoUsd ?? 0 }
      : etapa === "ia"
        ? { ...resumo, conferidas: anterior.conferidas ?? 0 }
        : resumo;
  await db.from("serena_config").upsert({ chave: "newton_ultima_rotina", valor, atualizado_em: new Date().toISOString() });
  return resumo;
}
