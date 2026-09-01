"use server";

import { revalidatePath } from "next/cache";
import { requireSomaStaff } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  syncOneCompany,
  MESES_ANTERIORES_HISTORICO,
  type ResultadoSincronizacao,
} from "@/lib/sync-notas";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import { extrairNotaDeXml, type NotaExtraidaXml } from "@/lib/xml-nota";
import { gerarZipDaEmpresa } from "@/lib/fechamento-export";
import { put, del, get } from "@vercel/blob";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

async function salvarNotaImportada(
  admin: SupabaseClient,
  companyId: string,
  cnpjEmpresa: string,
  nota: NotaExtraidaXml & { chaveAcesso: string },
): Promise<{ ok: true } | { ok: false; duplicada: boolean }> {
  const { error } = await admin.from("notas_distribuidas").insert({
    company_id: companyId,
    nsu: null,
    origem: "importado_manual",
    chave_acesso: nota.chaveAcesso,
    direcao: classificarDirecao(nota.prestadorCnpj, nota.tomadorCnpj, cnpjEmpresa),
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
    return { ok: false, duplicada: error.code === "23505" };
  }
  return { ok: true };
}

export type BuscarAgoraState = { resultado?: ResultadoSincronizacao; error?: string } | undefined;

export async function buscarAgora(
  _prevState: BuscarAgoraState,
  formData: FormData,
): Promise<BuscarAgoraState> {
  await requireSomaStaff();
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };
  const competenciaRaw = formData.get("competencia");
  const competencia = typeof competenciaRaw === "string" ? competenciaRaw : undefined;

  const admin = createAdminClient();
  const { data: company } = await admin
    .from("companies")
    .select(
      "id, cnpj, cpf, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  const resultado = await syncOneCompany(admin, company, competencia);
  revalidatePath(`/admin/empresas/${companyId}/fechamento`);
  return { resultado };
}

export async function buscarHistoricoAgora(
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
      "id, cnpj, cpf, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  const resultado = await syncOneCompany(admin, company, undefined, MESES_ANTERIORES_HISTORICO);
  revalidatePath(`/admin/empresas/${companyId}/fechamento`);
  return { resultado };
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

    const resultado = await salvarNotaImportada(admin, companyId, company.cnpj, {
      ...nota,
      chaveAcesso: nota.chaveAcesso,
    });

    if (!resultado.ok) {
      if (resultado.duplicada) {
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

export type ImportarFechamentoGlobalState =
  | {
      error?: string;
      resultado?: {
        importados: number;
        ignorados: number;
        erros: { arquivo: string; motivo: string }[];
      };
    }
  | undefined;

export async function importarFechamentoXmlGlobal(
  _prevState: ImportarFechamentoGlobalState,
  formData: FormData,
): Promise<ImportarFechamentoGlobalState> {
  await requireSomaStaff();

  const arquivos = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) {
    return { error: "Selecione um ou mais arquivos XML." };
  }

  const admin = createAdminClient();
  const { data: companies } = await admin.from("companies").select("id, cnpj").not("cnpj", "is", null);
  const porCnpj = new Map<string, { id: string; cnpj: string }>();
  for (const c of companies ?? []) {
    if (c.cnpj) porCnpj.set(c.cnpj, { id: c.id, cnpj: c.cnpj });
  }

  const erros: { arquivo: string; motivo: string }[] = [];
  const vistosNesseLote = new Set<string>(); // `${companyId}:${chaveAcesso}`
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
    if (!nota.chaveAcesso) {
      erros.push({
        arquivo: arquivo.name,
        motivo: "XML sem chave de acesso identificável — não importado.",
      });
      continue;
    }

    const empresasEnvolvidas = [nota.prestadorCnpj, nota.tomadorCnpj]
      .filter((cnpj): cnpj is string => !!cnpj)
      .map((cnpj) => porCnpj.get(cnpj))
      .filter((c): c is { id: string; cnpj: string } => !!c);

    if (empresasEnvolvidas.length === 0) {
      erros.push({
        arquivo: arquivo.name,
        motivo: "Nem o prestador nem o tomador têm CNPJ cadastrado no painel.",
      });
      continue;
    }

    let algumErro = false;
    for (const empresa of empresasEnvolvidas) {
      const chaveLote = `${empresa.id}:${nota.chaveAcesso}`;
      if (vistosNesseLote.has(chaveLote)) {
        ignorados += 1;
        continue;
      }
      vistosNesseLote.add(chaveLote);

      const resultado = await salvarNotaImportada(admin, empresa.id, empresa.cnpj, {
        ...nota,
        chaveAcesso: nota.chaveAcesso,
      });

      if (!resultado.ok) {
        if (resultado.duplicada) {
          ignorados += 1;
        } else {
          algumErro = true;
        }
        continue;
      }
      importados += 1;
    }

    if (algumErro) {
      erros.push({ arquivo: arquivo.name, motivo: "Não foi possível salvar essa nota." });
    }
  }

  revalidatePath("/admin/fechamento");
  return { resultado: { importados, ignorados, erros } };
}

// --- Exportação em ZIP (por lotes) -----------------------------------------
//
// "Baixar tudo (ZIP)" gerava tudo (XML + PDF de cada nota + relatório por
// empresa) numa chamada HTTP só — com milhares de notas num mês, estourava
// o tempo limite da função serverless (504). Passa a rodar uma empresa por
// vez a partir do navegador (mesmo padrão da sincronização), guardando o
// ZIP de cada empresa no Blob até juntar tudo no ZIP final.

export type EmpresaExportacao = { id: string; nome: string };

export async function iniciarExportacaoFechamento(
  competencia: string,
): Promise<{ exportacaoId: string; empresas: EmpresaExportacao[] } | { error: string }> {
  await requireSomaStaff();
  if (!/^\d{4}-\d{2}$/.test(competencia)) return { error: "Competência inválida." };

  const admin = createAdminClient();

  // Só as empresas que de fato têm nota nessa competência — evita
  // desperdiçar uma chamada por empresa sem nada pra exportar.
  const { data: notas } = await admin
    .from("notas_distribuidas")
    .select("company_id")
    .gte("competencia", `${competencia}-01`)
    .lt("competencia", primeiroDiaMesSeguinteLocal(competencia));

  const idsComNota = [...new Set((notas ?? []).map((n) => n.company_id))];
  if (idsComNota.length === 0) {
    return { error: "Nenhuma nota encontrada nessa competência." };
  }

  const { data: companies } = await admin
    .from("companies")
    .select("id, legal_name, trade_name")
    .in("id", idsComNota);

  const empresas: EmpresaExportacao[] = (companies ?? []).map((c) => ({
    id: c.id,
    nome: c.trade_name || c.legal_name,
  }));

  const { data: exportacao, error } = await admin
    .from("exportacoes_fechamento")
    .insert({ competencia, progresso_total: empresas.length })
    .select("id")
    .single();
  if (error || !exportacao) return { error: "Não foi possível iniciar a exportação." };

  return { exportacaoId: exportacao.id, empresas };
}

export async function processarEmpresaExportacao(
  exportacaoId: string,
  companyId: string,
  competencia: string,
): Promise<{ ok: true } | { error: string }> {
  await requireSomaStaff();
  const admin = createAdminClient();

  const { data: company } = await admin
    .from("companies")
    .select("id, cnpj, legal_name, trade_name")
    .eq("id", companyId)
    .single();
  if (!company) return { error: "Empresa não encontrada." };

  try {
    const zipBytes = await gerarZipDaEmpresa(admin, company, competencia);
    if (zipBytes) {
      await put(`fechamento-export/${exportacaoId}/${companyId}.zip`, Buffer.from(zipBytes), {
        access: "private",
        addRandomSuffix: false,
      });
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Falha ao gerar o ZIP da empresa." };
  }

  const { data: atual } = await admin
    .from("exportacoes_fechamento")
    .select("progresso_atual")
    .eq("id", exportacaoId)
    .single();
  await admin
    .from("exportacoes_fechamento")
    .update({ progresso_atual: (atual?.progresso_atual ?? 0) + 1 })
    .eq("id", exportacaoId);

  return { ok: true };
}

export async function finalizarExportacaoFechamento(
  exportacaoId: string,
  competencia: string,
  empresaIds: string[],
): Promise<{ ok: true } | { error: string }> {
  await requireSomaStaff();
  const admin = createAdminClient();

  const zipFinal = new JSZip();
  const pathnamesParaApagar: string[] = [];

  for (const companyId of empresaIds) {
    const pathname = `fechamento-export/${exportacaoId}/${companyId}.zip`;
    try {
      const blob = await get(pathname, { access: "private" });
      if (!blob || blob.statusCode !== 200) continue;
      const chunks: Uint8Array[] = [];
      const reader = blob.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const bytes = Buffer.concat(chunks);
      const subZip = await JSZip.loadAsync(bytes);
      for (const [caminho, arquivo] of Object.entries(subZip.files)) {
        if (arquivo.dir) continue;
        zipFinal.file(caminho, await arquivo.async("uint8array"));
      }
      pathnamesParaApagar.push(pathname);
    } catch {
      // Empresa sem ZIP gerado (sem nota, ou falhou antes) — segue sem ela.
    }
  }

  const finalBytes = await zipFinal.generateAsync({ type: "uint8array" });
  const finalPathname = `fechamento-export/${exportacaoId}/fechamento-${competencia}.zip`;
  await put(finalPathname, Buffer.from(finalBytes), { access: "private", addRandomSuffix: false });

  await admin
    .from("exportacoes_fechamento")
    .update({ status: "pronto", blob_pathname: finalPathname })
    .eq("id", exportacaoId);

  await Promise.all(pathnamesParaApagar.map((p) => del(p).catch(() => {})));

  return { ok: true };
}

// Cópia local — evita importar de fechamento-export.ts só por causa dessa
// função de uma linha (o restante do módulo é "server-only" por lidar com
// XML/PDF, não faz sentido puxar isso aqui só pela data).
function primeiroDiaMesSeguinteLocal(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
}
