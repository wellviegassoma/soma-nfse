"use server";

import { revalidatePath } from "next/cache";
import { requireSomaStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncOneCompany, syncAllCompanies, type ResultadoSincronizacao } from "@/lib/sync-notas";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import { extrairNotaDeXml } from "@/lib/xml-nota";

export type BuscarAgoraState = { resultado?: ResultadoSincronizacao; error?: string } | undefined;

export async function buscarAgora(
  _prevState: BuscarAgoraState,
  formData: FormData,
): Promise<BuscarAgoraState> {
  await requireSomaStaff();
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select(
      "id, cnpj, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  const resultado = await syncOneCompany(admin, company);
  revalidatePath(`/admin/empresas/${companyId}/fechamento`);
  return { resultado };
}

export type BuscarTodasState =
  | { resultados?: ResultadoSincronizacao[]; error?: string }
  | undefined;

export async function buscarTodasAgora(
  _prevState: BuscarTodasState,
): Promise<BuscarTodasState> {
  await requireSomaStaff();
  const resultados = await syncAllCompanies(createAdminClient());
  revalidatePath("/admin/fechamento");
  return { resultados };
}

export type ImportarFechamentoState =
  | {
      error?: string;
      resultado?: {
        importados: number;
        ignorados: number;
        erros: { arquivo: string; motivo: string }[];
      };
    }
  | undefined;

export async function importarFechamentoXml(
  _prevState: ImportarFechamentoState,
  formData: FormData,
): Promise<ImportarFechamentoState> {
  await requireSomaStaff();
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  const arquivos = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) {
    return { error: "Selecione um ou mais arquivos XML." };
  }

  const erros: { arquivo: string; motivo: string }[] = [];
  const vistosNesseLote = new Set<string>();
  let importados = 0;
  let ignorados = 0;

  for (const arquivo of arquivos) {
    let texto: string;
    try {
      texto = await arquivo.text();
    } catch {
      erros.push({ arquivo: arquivo.name, motivo: "Não foi possível ler o arquivo." });
      continue;
    }

    const nota = extrairNotaDeXml(texto);
    if (!nota) {
      erros.push({
        arquivo: arquivo.name,
        motivo: "Não consegui reconhecer esse arquivo como uma NFS-e/DPS válida.",
      });
      continue;
    }

    // Sem chave de acesso não dá pra deduplicar com segurança contra o
    // que já existe (sincronizado ou importado antes) — melhor pedir
    // pra conferir manualmente do que arriscar duplicar no relatório.
    if (!nota.chaveAcesso) {
      erros.push({
        arquivo: arquivo.name,
        motivo: "XML sem chave de acesso identificável — não importado.",
      });
      continue;
    }

    if (vistosNesseLote.has(nota.chaveAcesso)) {
      ignorados += 1;
      continue;
    }
    vistosNesseLote.add(nota.chaveAcesso);

    const { error } = await admin.from("notas_distribuidas").insert({
      company_id: companyId,
      nsu: null,
      origem: "importado_manual",
      chave_acesso: nota.chaveAcesso,
      direcao: classificarDirecao(nota.prestadorCnpj, nota.tomadorCnpj, company.cnpj),
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
      xml: nota.xml,
    });

    if (error) {
      if (error.code === "23505") {
        ignorados += 1;
      } else {
        erros.push({ arquivo: arquivo.name, motivo: "Não foi possível salvar essa nota." });
      }
      continue;
    }
    importados += 1;
  }

  revalidatePath(`/admin/empresas/${companyId}/fechamento`);
  return { resultado: { importados, ignorados, erros } };
}
