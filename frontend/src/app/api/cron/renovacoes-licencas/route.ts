import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { tipoAplicavel } from "@/app/legalizacao/status";
import { hojeSaoPaulo } from "@/app/legalizacao/processos/status";
import { ANTECEDENCIA_PADRAO_DIAS, diasEntre, regraAplicavel, type RegraVencimento } from "@/lib/legalizacao-licencas";
import { abrirRenovacaoCore } from "@/lib/legalizacao-renovacao-core";

export const maxDuration = 300;

// Vencida há mais que isso não abre sozinha: provavelmente é cadastro
// desatualizado (cliente saiu, licença deixou de ser exigida) — a equipe
// confere e abre pelo botão "Renovar" se for o caso.
const LIMITE_ATRASO_DIAS = 30;
const MAX_POR_EXECUCAO = 150;

/**
 * Todo dia: abre o processo de renovação de cada licença que entrou na
 * janela de antecedência da regra do tipo/município (padrão 60 dias) e
 * ainda não tem renovação aberta. Idempotente — o índice único de
 * "uma renovação aberta por empresa+tipo" impede duplicar.
 */
export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const [{ data: empresas }, { data: tipos }, { data: excecoes }, { data: regras }, { data: abertas }] =
    await Promise.all([
      admin
        .from("companies")
        .select("id, municipality_ibge_code, legalizacao_documentos(tipo_id, data_vencimento)")
        .eq("ativa", true),
      admin.from("legalizacao_tipos_documento").select("id, aplica_a_todas").eq("ativo", true),
      admin.from("legalizacao_tipos_empresas_excecao").select("company_id, tipo_id, aplicavel"),
      admin.from("legalizacao_regras_vencimento").select("*"),
      admin
        .from("legalizacao_processos")
        .select("company_id, licenca_tipo_id")
        .eq("tipo_processo", "RENOVACAO")
        .is("data_conclusao", null)
        .is("arquivado_em", null),
    ]);

  const hoje = hojeSaoPaulo();
  const excecao = new Map((excecoes ?? []).map((r) => [`${r.company_id}:${r.tipo_id}`, r.aplicavel]));
  const jaAbertas = new Set((abertas ?? []).map((a) => `${a.company_id}:${a.licenca_tipo_id}`));
  const tiposAtivos = new Map((tipos ?? []).map((t) => [t.id, t.aplica_a_todas]));

  type Empresa = {
    id: string;
    municipality_ibge_code: string | null;
    legalizacao_documentos: { tipo_id: string; data_vencimento: string | null }[] | null;
  };

  const candidatos: { companyId: string; tipoId: string }[] = [];
  for (const e of (empresas ?? []) as unknown as Empresa[]) {
    for (const doc of e.legalizacao_documentos ?? []) {
      if (!doc.data_vencimento) continue;
      const aplicaATodas = tiposAtivos.get(doc.tipo_id);
      if (aplicaATodas === undefined) continue; // tipo inativo
      if (!tipoAplicavel(aplicaATodas, excecao.get(`${e.id}:${doc.tipo_id}`))) continue;
      if (jaAbertas.has(`${e.id}:${doc.tipo_id}`)) continue;
      const antecedencia =
        regraAplicavel((regras ?? []) as RegraVencimento[], doc.tipo_id, e.municipality_ibge_code)
          ?.antecedencia_dias ?? ANTECEDENCIA_PADRAO_DIAS;
      const dias = diasEntre(hoje, doc.data_vencimento);
      if (dias <= antecedencia && dias >= -LIMITE_ATRASO_DIAS) {
        candidatos.push({ companyId: e.id, tipoId: doc.tipo_id });
      }
    }
  }

  let abertasAgora = 0;
  const erros: string[] = [];
  for (const c of candidatos.slice(0, MAX_POR_EXECUCAO)) {
    const r = await abrirRenovacaoCore(admin, { ...c, criadoPor: null, origem: "AUTOMATICA" });
    if ("processoId" in r) abertasAgora += 1;
    else if (!r.processoExistenteId) erros.push(`${c.companyId}/${c.tipoId}: ${r.error}`);
  }

  if (abertasAgora > 0) {
    revalidatePath("/legalizacao/renovacoes");
    revalidatePath("/legalizacao/licencas");
    revalidatePath("/legalizacao/processos");
  }

  return NextResponse.json({ candidatos: candidatos.length, abertas: abertasAgora, erros });
}
