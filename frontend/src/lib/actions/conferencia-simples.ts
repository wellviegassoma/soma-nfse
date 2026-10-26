"use server";

import { revalidatePath } from "next/cache";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_EMPRESA_SIMPLES,
  buscarExtrasConferencia,
  calcularSimplesEmpresa,
  type EmpresaSimples,
} from "@/lib/simples-linha";

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export type ResultadoAprovacao = { ok: true } | { ok: false; erro: string };

// Aprova uma empresa que está em "Revisar" pra entrar no lote de
// transmissão. Recalcula tudo no servidor e só grava se os números
// continuarem exatamente os que estavam na tela de quem aprovou
// (`assinaturaVista`) — se entrou nota nova entre abrir a tela e clicar,
// recusa e pede pra conferir de novo.
export async function aprovarConferenciaSimples(
  companyId: string,
  competencia: string,
  assinaturaVista: string,
  observacao: string,
): Promise<ResultadoAprovacao> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA_REGEX.test(competencia)) return { ok: false, erro: "Competência inválida." };

  const supabase = await createClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select(COLUNAS_EMPRESA_SIMPLES)
    .eq("id", companyId)
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .single<EmpresaSimples>();
  if (error || !company) return { ok: false, erro: "Empresa não encontrada no Simples Nacional." };

  const extras = await buscarExtrasConferencia(supabase, competencia, [companyId]);
  const calculo = await calcularSimplesEmpresa(supabase, company, competencia, {
    prefeitura: extras.prefeitura.get(companyId) ?? null,
    aprovacao: null,
  });

  if (calculo.conferencia.status === "BLOQUEADO") {
    return { ok: false, erro: "Empresa bloqueada — corrija o problema antes; bloqueio não pode ser aprovado." };
  }
  if (calculo.conferencia.status === "OK") {
    return { ok: false, erro: "Essa empresa não tem nada a revisar — já está liberada." };
  }
  if (calculo.assinatura !== assinaturaVista) {
    return {
      ok: false,
      erro: "Os números dessa empresa mudaram desde que a tela foi aberta. Atualize a página e confira de novo.",
    };
  }

  const { error: erroGravar } = await supabase.from("simples_conferencia_aprovacoes").upsert(
    {
      company_id: companyId,
      competencia,
      assinatura: calculo.assinatura,
      motivos: calculo.conferencia.motivos,
      observacao: observacao.trim() || null,
      aprovado_em: new Date().toISOString(),
      aprovado_por: user.id,
    },
    { onConflict: "company_id,competencia" },
  );
  if (erroGravar) return { ok: false, erro: `Não foi possível gravar a aprovação: ${erroGravar.message}` };

  revalidatePath("/admin/fechamento/simples");
  return { ok: true };
}

export async function desfazerAprovacaoConferenciaSimples(
  companyId: string,
  competencia: string,
): Promise<ResultadoAprovacao> {
  await requireSomaStaff();
  if (!COMPETENCIA_REGEX.test(competencia)) return { ok: false, erro: "Competência inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("simples_conferencia_aprovacoes")
    .delete()
    .eq("company_id", companyId)
    .eq("competencia", competencia);
  if (error) return { ok: false, erro: `Não foi possível desfazer: ${error.message}` };

  revalidatePath("/admin/fechamento/simples");
  return { ok: true };
}
