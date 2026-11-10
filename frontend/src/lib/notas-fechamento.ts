import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import { extrairNotaDeXml, type NotaExtraidaXml } from "@/lib/xml-nota";

export type OrigemNotaFechamento = "importado_manual" | "emitido_sistema";

/**
 * Grava uma nota em `notas_distribuidas` (a base do fechamento) a partir do
 * XML. Usado na importação manual de XML e na emissão pelo próprio sistema
 * — nesse caso a nota aparece no fechamento na hora, sem esperar a
 * distribuição do ADN (que pode levar horas). Quando a sincronização trouxer
 * a mesma nota, o upsert por (company_id, chave_acesso) não duplica.
 */
export async function salvarNotaNoFechamento(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  companyId: string,
  documentoEmpresa: string,
  nota: NotaExtraidaXml & { chaveAcesso: string },
  origem: OrigemNotaFechamento,
): Promise<{ ok: true } | { ok: false; duplicada: boolean; mensagem?: string }> {
  const { error } = await admin.from("notas_distribuidas").insert({
    company_id: companyId,
    nsu: null,
    origem,
    chave_acesso: nota.chaveAcesso,
    direcao: classificarDirecao(nota.prestadorCnpj, nota.tomadorCnpj, documentoEmpresa),
    cancelada: false,
    motivo_cancelamento: null,
    numero: nota.numero,
    data_emissao: nota.dataEmissao,
    competencia: nota.competencia,
    bate_competencia: true,
    prestador_cnpj: nota.prestadorCnpj,
    prestador_nome: nota.prestadorNome,
    tomador_cnpj: nota.tomadorCnpj,
    tomador_nome: nota.tomadorNome,
    descricao_servico: nota.descricaoServico,
    local_incidencia: nota.localIncidencia,
    codigo_trib_nacional: nota.codigoTribNacional,
    codigo_nbs: nota.codigoNbs,
    aliquota_issqn: nota.aliquotaIssqn,
    valor_servico: nota.valorServico,
    valor_issqn: nota.valorIssqn,
    valor_pis: nota.valorPis,
    valor_cofins: nota.valorCofins,
    valor_ret_cp: nota.valorRetCp,
    valor_ret_irrf: nota.valorRetIrrf,
    valor_ret_csll: nota.valorRetCsll,
    xml: nota.xml,
  });
  if (error) return { ok: false, duplicada: error.code === "23505", mensagem: error.message };
  return { ok: true };
}

/** Nota recém-emitida pelo sistema → fechamento. Nunca lança erro. */
export async function registrarNotaEmitidaNoFechamento(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  companyId: string,
  documentoEmpresa: string,
  xmlNfse: string,
  chaveAcesso: string,
): Promise<{ ok: true } | { ok: false; duplicada: boolean; mensagem?: string }> {
  const nota = extrairNotaDeXml(xmlNfse);
  if (!nota) return { ok: false, duplicada: false, mensagem: "XML da NFS-e não reconhecido" };
  return salvarNotaNoFechamento(
    admin,
    companyId,
    documentoEmpresa,
    { ...nota, chaveAcesso: nota.chaveAcesso ?? chaveAcesso },
    "emitido_sistema",
  );
}
