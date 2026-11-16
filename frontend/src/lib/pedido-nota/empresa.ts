import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { digitos, empresaPelaDica, empresasPorNome, type EmpresaRef } from "@/lib/pedido-nota/empresa-core";

// Descobre a empresa (prestadora) de um pedido de nota. Ordem, da mais
// confiável para a menos (ver migration fase_bk):
//   1. CNPJ no "#nota"       → grava o vínculo do contato/grupo
//   2. vínculo aprendido     (pedido_nota_vinculos)
//   3. telefone              (company_contatos_setor — hoje vazio, mas fica)
//   4. nome do grupo/contato → só se casar com UMA empresa; vira alerta
// Sem certeza: devolve as candidatas e o painel escolhe.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type FonteEmpresa = "CNPJ_COMANDO" | "VINCULO" | "TELEFONE" | "NOME_CONTATO";

export type EmpresaResolvida = {
  companyId: string | null;
  fonte: FonteEmpresa | null;
  candidatas: string[];
  /** Dica do atendente sem o documento da empresa (não ajuda a IA). */
  dica: string | null;
  /** Havia CPF/CNPJ na dica, mas de nenhuma empresa (pode ser do tomador). */
  cnpjNaoEncontrado: string | null;
};

async function carregarEmpresas(admin: Supa): Promise<EmpresaRef[]> {
  const todas: EmpresaRef[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin.from("companies").select("id, cnpj, cpf, legal_name, trade_name").range(de, de + 999);
    if (error) throw new Error(`falha ao ler empresas: ${error.message}`);
    todas.push(
      ...(data ?? []).map((c) => ({
        id: c.id as string,
        cnpj: (c.cnpj as string | null) ?? null,
        cpf: (c.cpf as string | null) ?? null,
        legalName: c.legal_name as string,
        tradeName: (c.trade_name as string | null) ?? null,
      })),
    );
    if (!data || data.length < 1000) break;
  }
  return todas;
}

export async function resolverEmpresa(
  admin: Supa,
  p: { contactId: string; nomeContato: string; telefone: string | null; dica: string | null; pedidoId: string },
): Promise<EmpresaResolvida> {
  const empresas = await carregarEmpresas(admin);

  // 1. CNPJ (ou CPF de cliente pessoa física) no comando
  const pelaDica = empresaPelaDica(p.dica, empresas);
  const resto = pelaDica.resto;
  const cnpjNaoEncontrado = pelaDica.documentoSemEmpresa;
  if (pelaDica.companyId) {
    const { error } = await admin
      .from("pedido_nota_vinculos")
      .upsert(
        { origem: "DIGISAC", origem_contact_id: p.contactId, company_id: pelaDica.companyId, fonte: "CNPJ_COMANDO", pedido_id: p.pedidoId },
        { onConflict: "origem,origem_contact_id" },
      );
    if (error) console.error("[pedido-nota] falha ao gravar vínculo:", error.message);
    return { companyId: pelaDica.companyId, fonte: "CNPJ_COMANDO", candidatas: [pelaDica.companyId], dica: resto, cnpjNaoEncontrado: null };
  }

  // 2. Vínculo aprendido
  const { data: vinculo } = await admin
    .from("pedido_nota_vinculos")
    .select("company_id")
    .eq("origem", "DIGISAC")
    .eq("origem_contact_id", p.contactId)
    .maybeSingle();
  if (vinculo?.company_id) {
    return { companyId: vinculo.company_id as string, fonte: "VINCULO", candidatas: [vinculo.company_id as string], dica: resto, cnpjNaoEncontrado };
  }

  // 3. Telefone
  if (p.telefone && digitos(p.telefone).length >= 8) {
    const { data } = await admin.rpc("pedido_nota_empresas_por_telefone", { p_telefone: p.telefone });
    const porTel = ((data ?? []) as unknown[]).map((v) =>
      typeof v === "string" ? v : String((v as Record<string, unknown>).pedido_nota_empresas_por_telefone),
    );
    if (porTel.length === 1) return { companyId: porTel[0], fonte: "TELEFONE", candidatas: porTel, dica: resto, cnpjNaoEncontrado };
    if (porTel.length > 1) return { companyId: null, fonte: null, candidatas: porTel, dica: resto, cnpjNaoEncontrado };
  }

  // 4. Nome do grupo ("SOMA + nome da empresa no sistema"): idêntico → usa;
  //    muito parecido e único → usa com alerta; senão, só sugestões.
  const porNome = empresasPorNome(p.nomeContato, empresas);
  if (porNome.exatas.length === 1) {
    return { companyId: porNome.exatas[0], fonte: "NOME_CONTATO", candidatas: porNome.exatas, dica: resto, cnpjNaoEncontrado };
  }
  if (porNome.exatas.length === 0 && porNome.fortes.length === 1) {
    return { companyId: porNome.fortes[0], fonte: "NOME_CONTATO", candidatas: porNome.fortes, dica: resto, cnpjNaoEncontrado };
  }
  const sugestoes = [...new Set([...porNome.exatas, ...porNome.fortes, ...porNome.candidatas])].slice(0, 10);
  return { companyId: null, fonte: null, candidatas: sugestoes, dica: resto, cnpjNaoEncontrado };
}
