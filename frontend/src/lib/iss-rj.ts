import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { buscarFaturamentoMensal, somarFaturamento } from "@/lib/faturamento";
import type { ResultadoItem } from "@/lib/rotina-fechamento/registrar";

// Código IBGE do Rio de Janeiro — mesmo valor usado em
// admin/empresas/[companyId]/impostos/guia-iss/route.ts.
export const IBGE_RIO_DE_JANEIRO = "3304557";

type ValoresGuiaFixo = { regime: "FIXO"; quantidadeProfissionais: number; valorIss: number | null };
type ValoresGuiaPercentual = {
  regime: "PERCENTUAL";
  valorServicos: number;
  baseCalculo: number | null;
  valorIss: number | null;
};
export type ValoresGuiaIssRj = ValoresGuiaFixo | ValoresGuiaPercentual;

function lerValoresDosHeaders(headers: Headers): ValoresGuiaIssRj | null {
  const regime = headers.get("X-Regime");
  const valorIss = headers.get("X-Valor-Iss");
  const valorIssNum = valorIss ? Number(valorIss) : null;
  if (regime === "FIXO") {
    const quantidade = Number(headers.get("X-Quantidade-Profissionais") ?? "");
    if (Number.isNaN(quantidade)) return null;
    return { regime: "FIXO", quantidadeProfissionais: quantidade, valorIss: valorIssNum };
  }
  if (regime === "PERCENTUAL") {
    const valorServicos = Number(headers.get("X-Valor-Servicos") ?? "");
    if (Number.isNaN(valorServicos)) return null;
    const baseCalculo = headers.get("X-Base-Calculo");
    return {
      regime: "PERCENTUAL",
      valorServicos,
      baseCalculo: baseCalculo ? Number(baseCalculo) : null,
      valorIss: valorIssNum,
    };
  }
  return null;
}

type EmpresaRj = {
  id: string;
  cnpj: string | null;
  cpf: string | null;
  certificates: { encrypted_file: string; encrypted_password: string; expires_at: string } | null;
};

// Busca (e, se ainda não existir, emite — ver docstring de
// nota_carioca_client.py sobre EMITIR GUIA ser uma ação real) a guia de
// ISS do Rio de Janeiro de uma empresa e devolve os valores extraídos —
// não precisa reabrir o PDF (é imagem) porque o nota-carioca-service já
// manda os valores via header, extraídos da tela de confirmação HTML.
export async function buscarValoresGuiaIssRj(
  empresa: EmpresaRj,
  competencia: string,
): Promise<{ ok: true; valores: ValoresGuiaIssRj } | { ok: false; erro: string }> {
  const certificado = empresa.certificates;
  if (!certificado) return { ok: false, erro: "Empresa sem certificado digital cadastrado." };
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    return { ok: false, erro: "Certificado digital vencido." };
  }

  const pfxBase64 = decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64");
  const senha = decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8");

  let response: Response;
  try {
    response = await fetch(`${process.env.NOTA_CARIOCA_SERVICE_URL}/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NOTA_CARIOCA_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({ certificado: { pfx_base64: pfxBase64, senha }, competencia }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, erro: "Não foi possível acessar o Nota Carioca agora." };
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    return {
      ok: false,
      erro: (corpo && typeof corpo.detail === "string" && corpo.detail) || "Falha ao buscar a guia.",
    };
  }

  await response.arrayBuffer(); // descarta o PDF — só os valores dos headers importam aqui
  const valores = lerValoresDosHeaders(response.headers);
  if (!valores) return { ok: false, erro: "Resposta do Nota Carioca sem valores reconhecíveis." };
  return { ok: true, valores };
}

// Etapas 2+3 da Rotina de Fechamento combinadas: buscar/emitir a guia JÁ
// devolve os valores necessários pra conferência (mesma chamada), então
// não faz sentido separar em duas rotas — só faz sentido separar na UI,
// se um dia precisar mostrar "emitido" antes de "conferido".
export async function rodarIssRjParaTodasEmpresas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  competencia: string,
): Promise<ResultadoItem[]> {
  const { data: empresas, error } = await supabase
    .from("companies")
    .select("id, cnpj, cpf, certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("municipality_ibge_code", IBGE_RIO_DE_JANEIRO)
    .eq("tax_regime", "LUCRO_PRESUMIDO");
  if (error) throw error;

  const resultados: ResultadoItem[] = [];
  for (const empresaRaw of empresas ?? []) {
    const empresa = {
      ...empresaRaw,
      certificates: Array.isArray(empresaRaw.certificates)
        ? empresaRaw.certificates[0]
        : empresaRaw.certificates,
    };

    const resposta = await buscarValoresGuiaIssRj(empresa, competencia);
    if (!resposta.ok) {
      resultados.push({ companyId: empresa.id, status: "ERRO", detalhes: { erro: resposta.erro } });
      continue;
    }

    if (resposta.valores.regime === "FIXO") {
      resultados.push({
        companyId: empresa.id,
        status: "OK",
        detalhes: {
          regime: "FIXO",
          quantidadeProfissionais: resposta.valores.quantidadeProfissionais,
          valorIss: resposta.valores.valorIss,
        },
      });
      continue;
    }

    const notas = await buscarFaturamentoMensal(supabase, empresa.id);
    const faturamentoSoma = somarFaturamento(notas, [competencia]);
    const diferenca = resposta.valores.valorServicos - faturamentoSoma;
    const bate = Math.abs(diferenca) < 0.01;
    resultados.push({
      companyId: empresa.id,
      status: bate ? "OK" : "DIVERGENCIA",
      detalhes: {
        regime: "PERCENTUAL",
        valorServicos: resposta.valores.valorServicos,
        faturamentoSoma,
        diferenca,
        valorIss: resposta.valores.valorIss,
      },
    });
  }

  return resultados;
}
