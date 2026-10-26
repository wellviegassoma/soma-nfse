"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  COLUNAS_EMPRESA_SIMPLES,
  buscarExtrasConferencia,
  calcularSimplesEmpresa,
  type EmpresaSimples,
} from "@/lib/simples-linha";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;
const MAX_LOTE = 400;

export type ResultadoAprovacao = { ok: true } | { ok: false; erro: string };
export type ResultadoAprovacaoLote = {
  aprovadas: number;
  recusadas: { companyId: string; erro: string }[];
  erroGeral?: string;
};

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
  const resultado = await aprovarUma(supabase, user.id, companyId, competencia, assinaturaVista, observacao);
  if (resultado.ok) revalidatePath("/admin/fechamento/simples");
  return resultado;
}

// Mesma verificação da aprovação individual, empresa por empresa — a
// observação vale pra todas. Quem não passar (número mudou, deixou de
// estar em Revisar) volta na lista de recusadas com o motivo; as outras
// são aprovadas normalmente.
export async function aprovarConferenciaSimplesLote(
  competencia: string,
  itens: { companyId: string; assinatura: string }[],
  observacao: string,
): Promise<ResultadoAprovacaoLote> {
  await requireSomaStaff();
  const user = await requireUser();
  if (!COMPETENCIA_REGEX.test(competencia)) return { aprovadas: 0, recusadas: [], erroGeral: "Competência inválida." };
  if (itens.length === 0) return { aprovadas: 0, recusadas: [], erroGeral: "Nenhuma empresa selecionada." };
  if (itens.length > MAX_LOTE) {
    return { aprovadas: 0, recusadas: [], erroGeral: `Máximo de ${MAX_LOTE} empresas por aprovação.` };
  }

  const supabase = await createClient();
  let aprovadas = 0;
  const recusadas: ResultadoAprovacaoLote["recusadas"] = [];

  // Em blocos pequenos: cada empresa faz ~7 consultas pra recalcular.
  const BLOCO = 10;
  for (let i = 0; i < itens.length; i += BLOCO) {
    const bloco = itens.slice(i, i + BLOCO);
    const resultados = await Promise.all(
      bloco.map((item) => aprovarUma(supabase, user.id, item.companyId, competencia, item.assinatura, observacao)),
    );
    resultados.forEach((r, j) => {
      if (r.ok) aprovadas += 1;
      else recusadas.push({ companyId: bloco[j].companyId, erro: r.erro });
    });
  }

  revalidatePath("/admin/fechamento/simples");
  return { aprovadas, recusadas };
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

async function aprovarUma(
  supabase: Supa,
  userId: string,
  companyId: string,
  competencia: string,
  assinaturaVista: string,
  observacao: string,
): Promise<ResultadoAprovacao> {
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
    return { ok: false, erro: "Bloqueada — corrija o problema antes; bloqueio não pode ser aprovado." };
  }
  if (calculo.conferencia.status === "OK") {
    return { ok: false, erro: "Não tem nada a revisar — já está liberada." };
  }
  if (calculo.assinatura !== assinaturaVista) {
    return { ok: false, erro: "Os números mudaram desde que a tela foi aberta. Atualize a página e confira de novo." };
  }

  const { error: erroGravar } = await supabase.from("simples_conferencia_aprovacoes").upsert(
    {
      company_id: companyId,
      competencia,
      assinatura: calculo.assinatura,
      motivos: calculo.conferencia.motivos,
      observacao: observacao.trim() || null,
      aprovado_em: new Date().toISOString(),
      aprovado_por: userId,
    },
    { onConflict: "company_id,competencia" },
  );
  if (erroGravar) return { ok: false, erro: `Não foi possível gravar a aprovação: ${erroGravar.message}` };
  return { ok: true };
}
