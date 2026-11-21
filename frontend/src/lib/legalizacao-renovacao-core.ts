import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeSaoPaulo } from "@/app/legalizacao/processos/status";

// Abre o processo de renovação de uma licença (empresa + tipo). Fica fora do
// arquivo de server actions porque recebe o client do Supabase: a tela usa o
// client do usuário (RLS) e a rotina diária usa o client admin.
export async function abrirRenovacaoCore(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    tipoId: string;
    criadoPor: string | null;
    origem: "MANUAL" | "AUTOMATICA";
    responsavelId?: string | null;
  },
): Promise<{ processoId: string } | { error: string; processoExistenteId?: string }> {
  const { companyId, tipoId, criadoPor, origem } = params;

  const [{ data: empresa }, { data: tipo }, { data: licenca }, { data: fluxo }] = await Promise.all([
    supabase
      .from("companies")
      .select("legal_name, trade_name, codigo_cliente, municipality_ibge_code")
      .eq("id", companyId)
      .maybeSingle(),
    supabase.from("legalizacao_tipos_documento").select("nome").eq("id", tipoId).maybeSingle(),
    supabase
      .from("legalizacao_documentos")
      .select("data_vencimento")
      .eq("company_id", companyId)
      .eq("tipo_id", tipoId)
      .maybeSingle(),
    supabase
      .from("legalizacao_fluxos")
      .select("id, nome")
      .eq("tipo_processo", "RENOVACAO")
      .eq("ativo", true)
      .order("ordem")
      .limit(1)
      .maybeSingle(),
  ]);
  if (!empresa) return { error: "Empresa não encontrada." };
  if (!tipo) return { error: "Tipo de licença não encontrado." };
  if (!fluxo) return { error: "Nenhum fluxo de renovação ativo — confira em Fluxos." };

  const { data: aberta } = await supabase
    .from("legalizacao_processos")
    .select("id")
    .eq("tipo_processo", "RENOVACAO")
    .eq("company_id", companyId)
    .eq("licenca_tipo_id", tipoId)
    .is("data_conclusao", null)
    .is("arquivado_em", null)
    .maybeSingle();
  if (aberta) return { error: "Já existe uma renovação aberta para essa licença.", processoExistenteId: aberta.id };

  const [{ data: fasesTemplate }, { data: requisitos }] = await Promise.all([
    supabase
      .from("legalizacao_fluxo_fases_template")
      .select("nome, ordem, descricao, acao, tipo_documento_id")
      .eq("fluxo_id", fluxo.id)
      .eq("ativo", true)
      .order("ordem"),
    supabase
      .from("legalizacao_requisitos")
      .select("item, ordem, municipality_ibge_code")
      .eq("tipo_id", tipoId)
      .eq("ativo", true)
      .order("ordem"),
  ]);
  if (!fasesTemplate || fasesTemplate.length === 0) return { error: "O fluxo de renovação não tem fases." };

  // Checklist do município da empresa; sem ele, o padrão do tipo.
  const doMunicipio = (requisitos ?? []).filter(
    (r) => empresa.municipality_ibge_code && r.municipality_ibge_code === empresa.municipality_ibge_code,
  );
  const checklist = doMunicipio.length > 0 ? doMunicipio : (requisitos ?? []).filter((r) => !r.municipality_ibge_code);

  const nomeEmpresa = empresa.trade_name || empresa.legal_name;
  const hoje = hojeSaoPaulo();
  const vencimento = licenca?.data_vencimento ?? null;

  const { data: processo, error } = await supabase
    .from("legalizacao_processos")
    .insert({
      tipo_processo: "RENOVACAO",
      fluxo_id: fluxo.id,
      fluxo_nome: fluxo.nome,
      nome: `${empresa.codigo_cliente ? `#${empresa.codigo_cliente} ` : ""}${nomeEmpresa} — ${tipo.nome}`,
      company_id: companyId,
      data_inicio: hoje,
      prazo_final: vencimento && vencimento >= hoje ? vencimento : null,
      responsavel_id: params.responsavelId ?? null,
      licenca_tipo_id: tipoId,
      licenca_vencimento: vencimento,
      origem_renovacao: origem,
      criado_por: criadoPor,
    })
    .select("id")
    .single();
  if (error || !processo) {
    if (error?.code === "23505") return { error: "Já existe uma renovação aberta para essa licença." };
    return { error: "Não foi possível abrir a renovação." };
  }

  const { error: fasesError } = await supabase.from("legalizacao_processo_fases").insert(
    fasesTemplate.map((f) => ({
      processo_id: processo.id,
      nome: f.nome,
      ordem: f.ordem,
      descricao: f.descricao,
      acao: f.acao,
      tipo_documento_id: f.tipo_documento_id,
    })),
  );
  if (fasesError) {
    await supabase.from("legalizacao_processos").delete().eq("id", processo.id);
    return { error: "Não foi possível criar as fases da renovação." };
  }

  if (checklist.length > 0) {
    await supabase
      .from("legalizacao_processo_requisitos")
      .insert(checklist.map((r) => ({ processo_id: processo.id, item: r.item, ordem: r.ordem })));
  }

  const venceTexto = vencimento ? ` — licença atual vence em ${vencimento.split("-").reverse().join("/")}` : "";
  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: processo.id,
    tipo: "SISTEMA",
    autor_id: criadoPor,
    corpo:
      origem === "AUTOMATICA"
        ? `Renovação aberta automaticamente${venceTexto}.`
        : `Renovação aberta${venceTexto}.`,
  });

  return { processoId: processo.id };
}
