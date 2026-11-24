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
  dataAbertura: string | null;
  email: string | null;
  /** "RUA", "AVENIDA"... — a BrasilAPI separa do logradouro. */
  tipoLogradouro: string | null;
  /** DDD + número, só dígitos. */
  telefone: string | null;
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
  data_inicio_atividade: string | null;
  email?: string | null;
  descricao_tipo_de_logradouro?: string | null;
  ddd_telefone_1?: string | null;
};

export async function buscarDadosCnpj(
  cnpjDigits: string,
): Promise<{ data: DadosCnpj } | { error: string }> {
  if (!/^\d{14}$/.test(cnpjDigits)) {
    return { error: "CNPJ inválido — precisa ter 14 dígitos." };
  }

  // BrasilAPI cai de vez em quando (503). A Minha Receita usa o mesmo
  // formato de resposta, então serve de reserva sem conversão.
  const fontes = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`,
    `https://minhareceita.org/${cnpjDigits}`,
  ];
  let resp: Response | null = null;
  for (const url of fontes) {
    try {
      // BrasilAPI bloqueia (403) o User-Agent padrão "node" do fetch nativo —
      // precisa de um valor explícito qualquer.
      resp = await fetch(url, {
        headers: { "User-Agent": "soma-nfse/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      resp = null;
      continue;
    }
    // 404 é resposta definitiva; o resto (5xx, 403, 429) tenta a próxima fonte.
    if (resp.ok || resp.status === 404) break;
  }

  // Para alguns CNPJs as duas acima respondem 503 juntas (mesma origem de
  // dados). A CNPJ.ws tem base própria — formato diferente, convertido aqui.
  if (!resp || (!resp.ok && resp.status !== 404)) {
    const reserva = await buscarNaCnpjWs(cnpjDigits);
    if (reserva) return { data: normalizar(reserva) };
  }

  if (!resp) {
    return { error: "Não foi possível consultar o CNPJ agora. Tente novamente." };
  }
  if (resp.status === 404) {
    return { error: "CNPJ não encontrado na base da Receita Federal." };
  }
  if (resp.status === 429) {
    return { error: "Muitas consultas em sequência — aguarde um instante e tente de novo." };
  }
  if (!resp.ok) {
    return { error: `Consulta ao CNPJ falhou (HTTP ${resp.status}). Tente de novo em alguns minutos.` };
  }

  return { data: normalizar((await resp.json()) as BrasilApiCnpjResponse) };
}

function normalizar(json: BrasilApiCnpjResponse): DadosCnpj {
  const situacao = json.descricao_situacao_cadastral;
  return {
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
    dataAbertura: json.data_inicio_atividade || null,
    email: json.email ? json.email.toLowerCase() : null,
    tipoLogradouro: json.descricao_tipo_de_logradouro || null,
    telefone: (json.ddd_telefone_1 || "").replace(/\D/g, "") || null,
  };
}

type CnpjWsResponse = {
  razao_social: string;
  simples: { simples?: string | null } | null;
  estabelecimento: {
    cnpj: string;
    nome_fantasia: string | null;
    situacao_cadastral: string | null;
    data_inicio_atividade: string | null;
    tipo_logradouro: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cep: string | null;
    ddd1: string | null;
    telefone1: string | null;
    email: string | null;
    atividade_principal: { subclasse?: string | null; descricao?: string | null } | null;
    cidade: { nome?: string | null; ibge_id?: number | null } | null;
    estado: { sigla?: string | null } | null;
  };
};

async function buscarNaCnpjWs(cnpjDigits: string): Promise<BrasilApiCnpjResponse | null> {
  try {
    const resp = await fetch(`https://publica.cnpj.ws/cnpj/${cnpjDigits}`, {
      headers: { "User-Agent": "soma-nfse/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return null;
    const d = (await resp.json()) as CnpjWsResponse;
    const e = d.estabelecimento;
    const cnae = (e.atividade_principal?.subclasse || "").replace(/\D/g, "");
    return {
      cnpj: e.cnpj,
      razao_social: d.razao_social,
      nome_fantasia: e.nome_fantasia,
      cnae_fiscal: cnae ? Number(cnae) : null,
      cnae_fiscal_descricao: e.atividade_principal?.descricao ?? null,
      codigo_municipio_ibge: e.cidade?.ibge_id ?? null,
      municipio: e.cidade?.nome ? e.cidade.nome.toUpperCase() : null,
      uf: e.estado?.sigla ?? null,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      cep: e.cep,
      descricao_situacao_cadastral: e.situacao_cadastral ? e.situacao_cadastral.toUpperCase() : null,
      opcao_pelo_simples: d.simples ? d.simples.simples === "Sim" : null,
      data_inicio_atividade: e.data_inicio_atividade,
      email: e.email,
      descricao_tipo_de_logradouro: e.tipo_logradouro,
      ddd_telefone_1: e.ddd1 && e.telefone1 ? `${e.ddd1}${e.telefone1}` : null,
    };
  } catch {
    return null;
  }
}
