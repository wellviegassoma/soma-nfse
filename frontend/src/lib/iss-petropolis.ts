import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { buscarFaturamentoMensal, somarFaturamento } from "@/lib/faturamento";
import type { ResultadoItem } from "@/lib/rotina-fechamento/registrar";

// Código IBGE do município de Petrópolis-RJ — mesmo valor usado em
// admin/empresas/[companyId]/impostos/petropolis-empresa.ts (que esse
// módulo substitui; ver histórico se precisar comparar).
export const IBGE_PETROPOLIS = "3303906";

export type EmpresaPetropolis =
  | { ok: true; cnpj: string; loginProprio: { login: string; senhaMd5: string } | null }
  | { ok: false; erro: string; status: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export async function buscarEmpresaPetropolis(
  supabase: Supa,
  companyId: string,
): Promise<EmpresaPetropolis> {
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, municipality_ibge_code")
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

  return { ok: true, cnpj: company.cnpj, loginProprio };
}

export type ResumoPetropolis = { valorServicos: number; valorIss: number };

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
      resumo: { valorServicos: corpo.valor_servicos, valorIss: corpo.valor_iss },
    };
  }

  const valorServicos = Number(response.headers.get("X-Valor-Servicos") ?? "");
  const valorIss = Number(response.headers.get("X-Valor-Iss") ?? "");
  const pdfBytes = await response.arrayBuffer();
  if (Number.isNaN(valorServicos) || Number.isNaN(valorIss)) {
    return { ok: false, erro: "Resposta do ISS de Petrópolis sem valores reconhecíveis." };
  }
  return { ok: true, consolidado: true, resumo: { valorServicos, valorIss }, pdfBytes };
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

  const valorServicos = Number(response.headers.get("X-Valor-Servicos") ?? "");
  const valorIss = Number(response.headers.get("X-Valor-Iss") ?? "");
  const pdfBytes = await response.arrayBuffer();
  if (Number.isNaN(valorServicos) || Number.isNaN(valorIss)) {
    return { ok: false, erro: "Resposta do ISS de Petrópolis sem valores reconhecíveis." };
  }
  return { ok: true, resumo: { valorServicos, valorIss }, pdfBytes };
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
      },
    });
  }

  return resultados;
}
