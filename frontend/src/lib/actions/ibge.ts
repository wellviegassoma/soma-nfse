"use server";

// API pública do IBGE (sem chave) — usada só pra mostrar o nome do
// município a partir do código que já está/foi digitado em Dados
// fiscais, não pra validar o código em si.
export async function buscarMunicipioIbge(
  codigo: string,
): Promise<{ nome: string; uf: string } | null> {
  if (!/^\d{7}$/.test(codigo)) return null;

  let json: unknown;
  try {
    const resp = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${codigo}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!resp.ok) return null;
    json = await resp.json();
  } catch {
    return null;
  }

  // Código inexistente devolve HTTP 200 com um array vazio, não 404
  // (confirmado ao vivo) — só um objeto de verdade tem "nome".
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const municipio = json as {
    nome?: string;
    microrregiao?: { mesorregiao?: { UF?: { sigla?: string } } };
  };
  if (!municipio.nome) return null;

  return {
    nome: municipio.nome,
    uf: municipio.microrregiao?.mesorregiao?.UF?.sigla ?? "",
  };
}
