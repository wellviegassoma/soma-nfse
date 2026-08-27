// Consulta de dados cadastrais de CNPJ (Receita Federal) via BrasilAPI —
// espelho público e gratuito do CNPJ da Receita, sem necessidade de chave.
// Usado tanto no cadastro manual de empresa (botão "Buscar dados") quanto
// na importação em lote por planilha.
import "server-only";

export type DadosCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnae: string | null;
  cnaeDescricao: string | null;
  municipioIbge: string | null;
  municipio: string | null;
  uf: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  situacaoCadastral: string | null;
  ativa: boolean;
  simplesNacional: boolean;
};

type BrasilApiCnpjResponse = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnae_fiscal: number | null;
  cnae_fiscal_descricao: string | null;
  codigo_municipio_ibge: number | null;
  municipio: string | null;
  uf: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  descricao_situacao_cadastral: string | null;
  opcao_pelo_simples: boolean | null;
};

export async function buscarDadosCnpj(
  cnpjDigits: string,
): Promise<{ data: DadosCnpj } | { error: string }> {
  if (!/^\d{14}$/.test(cnpjDigits)) {
    return { error: "CNPJ inválido — precisa ter 14 dígitos." };
  }

  let resp: Response;
  try {
    // BrasilAPI bloqueia (403) o User-Agent padrão "node" do fetch nativo —
    // precisa de um valor explícito qualquer.
    resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
      headers: { "User-Agent": "soma-nfse/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: "Não foi possível consultar o CNPJ agora. Tente novamente." };
  }

  if (resp.status === 404) {
    return { error: "CNPJ não encontrado na base da Receita Federal." };
  }
  if (resp.status === 429) {
    return { error: "Muitas consultas em sequência — aguarde um instante e tente de novo." };
  }
  if (!resp.ok) {
    return { error: `Consulta ao CNPJ falhou (HTTP ${resp.status}).` };
  }

  const json = (await resp.json()) as BrasilApiCnpjResponse;
  const situacao = json.descricao_situacao_cadastral;

  return {
    data: {
      cnpj: json.cnpj,
      razaoSocial: json.razao_social,
      nomeFantasia: json.nome_fantasia || null,
      cnae: json.cnae_fiscal != null ? String(json.cnae_fiscal) : null,
      cnaeDescricao: json.cnae_fiscal_descricao || null,
      municipioIbge: json.codigo_municipio_ibge != null ? String(json.codigo_municipio_ibge) : null,
      municipio: json.municipio || null,
      uf: json.uf || null,
      logradouro: json.logradouro || null,
      numero: json.numero || null,
      complemento: json.complemento || null,
      bairro: json.bairro || null,
      cep: json.cep || null,
      situacaoCadastral: situacao || null,
      ativa: (situacao || "").toUpperCase() === "ATIVA",
      simplesNacional: json.opcao_pelo_simples === true,
    },
  };
}
