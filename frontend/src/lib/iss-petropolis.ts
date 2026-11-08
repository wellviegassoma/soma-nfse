import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { buscarFaturamentoMensal, somarFaturamento } from "@/lib/faturamento";
import type { ResultadoItem } from "@/lib/rotina-fechamento/registrar";
import { registrarFechamentoIssSistema } from "@/lib/iss-fechamentos";

// Código IBGE do município de Petrópolis-RJ — mesmo valor usado em
// admin/empresas/[companyId]/impostos/petropolis-empresa.ts (que esse
// módulo substitui; ver histórico se precisar comparar).
export const IBGE_PETROPOLIS = "3303906";

export type EmpresaPetropolis =
  | {
      ok: true;
      cnpj: string;
      loginProprio: { login: string; senhaMd5: string } | null;
      cmc: string | null;
    }
  | { ok: false; erro: string; status: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export async function buscarEmpresaPetropolis(
  supabase: Supa,
  companyId: string,
): Promise<EmpresaPetropolis> {
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, municipality_ibge_code, petropolis_cmc")
    .eq("id", companyId)
    .single();

  if (!company) {
    return { ok: false, erro: "Empresa não encontrada.", status: 404 };
  }
  if (company.municipality_ibge_code !== IBGE_PETROPOLIS) {
    return {
      ok: false,
      erro: "Guia de ISS de Petrópolis só está disponível para empresas do município.",
      status: 400,
    };
  }
  if (!company.cnpj) {
    return { ok: false, erro: "Empresa sem CNPJ cadastrado.", status: 400 };
  }

  // Empresa com login próprio no site da Prefeitura entra direto, sem
  // precisar escolher a empresa numa lista (isso só existe no login
  // único do escritório, que enxerga todos os clientes) — evita
  // depender da busca por CNPJ desse site, que não filtra de verdade.
  const { data: credencial } = await supabase
    .from("petropolis_credenciais")
    .select("login, encrypted_senha")
    .eq("company_id", companyId)
    .maybeSingle();

  let loginProprio: { login: string; senhaMd5: string } | null = null;
  if (credencial) {
    const senha = decryptSecret(fromBytea(credencial.encrypted_senha)).toString("utf8");
    const senhaMd5 = crypto.createHash("md5").update(senha, "utf8").digest("hex");
    loginProprio = { login: credencial.login, senhaMd5 };
  }

  return { ok: true, cnpj: company.cnpj, loginProprio, cmc: company.petropolis_cmc };
}

// valorServicos = notas Normais + notas com ISS Retido pelo tomador (é o
// faturamento, que se compara com o SOMA); valorIss = só o ISS das Normais,
// que é o que vai na guia — o retido o tomador recolhe.
export type ResumoPetropolis = {
  valorServicos: number;
  valorIss: number;
  servicosRetidos: number;
  issRetido: number;
};

function numeroOuZero(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function resumoDosHeaders(headers: Headers): ResumoPetropolis | null {
  const valorServicos = Number(headers.get("X-Valor-Servicos") ?? "");
  const valorIss = Number(headers.get("X-Valor-Iss") ?? "");
  if (Number.isNaN(valorServicos) || Number.isNaN(valorIss)) return null;
  return {
    valorServicos,
    valorIss,
    servicosRetidos: numeroOuZero(headers.get("X-Servicos-Retidos")),
    issRetido: numeroOuZero(headers.get("X-Iss-Retido")),
  };
}

export function headersDoResumo(resumo: ResumoPetropolis): Record<string, string> {
  return {
    "X-Valor-Servicos": resumo.valorServicos.toFixed(2),
    "X-Valor-Iss": resumo.valorIss.toFixed(2),
    "X-Servicos-Retidos": resumo.servicosRetidos.toFixed(2),
    "X-Iss-Retido": resumo.issRetido.toFixed(2),
  };
}

type RespostaConferir =
  | { ok: true; consolidado: false; resumo: ResumoPetropolis }
  | { ok: true; consolidado: true; resumo: ResumoPetropolis; pdfBytes: ArrayBuffer }
  | { ok: false; erro: string };

// Etapa 4 — só leitura: pergunta pro nfse-engine o valor de serviços já
// lançado no período (consolidado ou não), sem criar nada na Prefeitura.
export async function conferirBaseCalculoPetropolis(
  supabase: Supa,
  companyId: string,
  competencia: string | null,
): Promise<RespostaConferir> {
  const empresa = await buscarEmpresaPetropolis(supabase, companyId);
  if (!empresa.ok) return { ok: false, erro: empresa.erro };

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        cnpj: empresa.cnpj,
        competencia,
        login: empresa.loginProprio?.login,
        senha_md5: empresa.loginProprio?.senhaMd5,
        cmc: empresa.cmc,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível acessar o ISS de Petrópolis agora." };
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    return {
      ok: false,
      erro: (corpo && typeof corpo.detail === "string" && corpo.detail) || "Falha ao buscar a guia.",
    };
  }

  if ((response.headers.get("content-type") ?? "").includes("application/json")) {
    const corpo = await response.json();
    return {
      ok: true,
      consolidado: false,
      resumo: {
        valorServicos: corpo.valor_servicos,
        valorIss: corpo.valor_iss,
        servicosRetidos: numeroOuZero(corpo.servicos_retidos),
        issRetido: numeroOuZero(corpo.iss_retido),
      },
    };
  }

  const resumo = resumoDosHeaders(response.headers);
  const pdfBytes = await response.arrayBuffer();
  if (!resumo) {
    return { ok: false, erro: "Resposta do ISS de Petrópolis sem valores reconhecíveis." };
  }
  return { ok: true, consolidado: true, resumo, pdfBytes };
}

// Só leitura (nunca consolida nem gera guia) — usada na conferência de
// faturamento do Simples Nacional. Exige login próprio ou CMC (o backend
// recusa o resto de propósito, ver ClientePetropolis.consultar_faturamento).
export async function consultarFaturamentoPetropolis(
  supabase: Supa,
  companyId: string,
  competencia: string,
): Promise<{ ok: true; valorServicos: number; linhas: string[][] } | { ok: false; erro: string }> {
  const empresa = await buscarEmpresaPetropolis(supabase, companyId);
  if (!empresa.ok) return { ok: false, erro: empresa.erro };

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/faturamento`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        cnpj: empresa.cnpj,
        competencia,
        login: empresa.loginProprio?.login,
        senha_md5: empresa.loginProprio?.senhaMd5,
        cmc: empresa.cmc,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, erro: "Não foi possível acessar o ISS de Petrópolis agora." };
  }

  const corpo = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      ok: false,
      erro: (corpo && typeof corpo.detail === "string" && corpo.detail) || "Falha ao consultar o ISS de Petrópolis.",
    };
  }
  const valor = Number(corpo?.valor_servicos);
  if (Number.isNaN(valor)) return { ok: false, erro: "Resposta do ISS de Petrópolis sem valor reconhecível." };
  return { ok: true, valorServicos: valor, linhas: Array.isArray(corpo?.linhas) ? corpo.linhas : [] };
}

// Etapa 5 — ação real: fecha o movimento econômico do mês na Prefeitura
// e emite a guia. Só deve ser chamada depois de confirmação explícita
// (nunca em lote silencioso) — ver comentário na rota que usa isso.
export async function emitirGuiaIssPetropolis(
  supabase: Supa,
  companyId: string,
  competencia: string | null,
): Promise<{ ok: true; resumo: ResumoPetropolis; pdfBytes: ArrayBuffer } | { ok: false; erro: string }> {
  const empresa = await buscarEmpresaPetropolis(supabase, companyId);
  if (!empresa.ok) return { ok: false, erro: empresa.erro };

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/consolidar-e-emitir-guia`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        cnpj: empresa.cnpj,
        competencia,
        login: empresa.loginProprio?.login,
        senha_md5: empresa.loginProprio?.senhaMd5,
        cmc: empresa.cmc,
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível acessar o ISS de Petrópolis agora." };
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    return {
      ok: false,
      erro:
        (corpo && typeof corpo.detail === "string" && corpo.detail) ||
        "Não foi possível consolidar e gerar a guia agora.",
    };
  }

  const resumo = resumoDosHeaders(response.headers);
  const pdfBytes = await response.arrayBuffer();
  if (!resumo) {
    return { ok: false, erro: "Resposta do ISS de Petrópolis sem valores reconhecíveis." };
  }
  await registrarFechamentoIssSistema(supabase, { companyId, competencia, valorGuia: resumo.valorIss });
  return { ok: true, resumo, pdfBytes };
}

export async function rodarConferenciaPetropolisParaTodasEmpresas(
  supabase: Supa,
  competencia: string,
): Promise<ResultadoItem[]> {
  const { data: empresas, error } = await supabase
    .from("companies")
    .select("id")
    .eq("municipality_ibge_code", IBGE_PETROPOLIS)
    .eq("tax_regime", "LUCRO_PRESUMIDO");
  if (error) throw error;

  const resultados: ResultadoItem[] = [];
  for (const empresa of empresas ?? []) {
    const resposta = await conferirBaseCalculoPetropolis(supabase, empresa.id, competencia);
    if (!resposta.ok) {
      resultados.push({ companyId: empresa.id, status: "ERRO", detalhes: { erro: resposta.erro } });
      continue;
    }

    const notas = await buscarFaturamentoMensal(supabase, empresa.id);
    const faturamentoSoma = somarFaturamento(notas, [competencia]);
    const diferenca = resposta.resumo.valorServicos - faturamentoSoma;
    const bate = Math.abs(diferenca) < 0.01;
    resultados.push({
      companyId: empresa.id,
      status: bate ? "OK" : "DIVERGENCIA",
      detalhes: {
        consolidado: resposta.consolidado,
        valorServicos: resposta.resumo.valorServicos,
        faturamentoSoma,
        diferenca,
        valorIss: resposta.resumo.valorIss,
        servicosRetidos: resposta.resumo.servicosRetidos,
      },
    });
  }

  return resultados;
}
