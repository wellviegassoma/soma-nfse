// Consulta de endereço por CEP via ViaCEP — serviço público e gratuito,
// sem necessidade de chave. Usado no cadastro de tomador pra preencher
// cidade/bairro/logradouro sozinho: cadastrar um tomador com CEP mas sem
// cidade faz a Receita rejeitar a nota (erro E0240 — "CEP não pertence
// ao município do tomador"), porque não dá pra confirmar que o CEP
// informado bate com a cidade.
import "server-only";

export type DadosCep = {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
};

type ViaCepResponse = {
  erro?: string | boolean;
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
};

export async function buscarDadosCep(cepDigits: string): Promise<{ data: DadosCep } | { error: string }> {
  if (!/^\d{8}$/.test(cepDigits)) {
    return { error: "CEP inválido — precisa ter 8 dígitos." };
  }

  let resp: Response;
  try {
    resp = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { error: "Não foi possível consultar o CEP agora. Tente novamente." };
  }

  if (!resp.ok) {
    return { error: `Consulta ao CEP falhou (HTTP ${resp.status}).` };
  }

  const json = (await resp.json()) as ViaCepResponse;
  if (json.erro) {
    return { error: "CEP não encontrado." };
  }

  return {
    data: {
      cep: json.cep,
      logradouro: json.logradouro || null,
      bairro: json.bairro || null,
      cidade: json.localidade || null,
      uf: json.uf || null,
    },
  };
}
