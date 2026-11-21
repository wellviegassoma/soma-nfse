// Alarme do limite de 1000 linhas da API do Supabase (PostgREST).
//
// Toda leitura sem .range()/.limit() volta cortada em 1000 linhas SEM
// erro nenhum — foi assim que retenções, receitas manuais e o faturamento
// da Visão geral sumiram em silêncio. A auditoria de 20/11/2026 paginou
// tudo que já passava ou ia passar desse tamanho; este fetch pega o que
// sobrar: se uma resposta vier com 1000 linhas ou mais sem o código ter
// pedido uma faixa (limit/offset/Range), registra "[LIMITE-1000]" nos logs
// da Vercel com a tabela e o filtro, pra corrigir antes de alguém notar
// número faltando.
const LIMITE_API = 1000;

export const fetchComAlertaLimite: typeof fetch = async (input, init) => {
  const resposta = await fetch(input, init);
  try {
    const intervalo = resposta.headers.get("content-range"); // ex.: "0-999/*"
    const m = intervalo?.match(/^(\d+)-(\d+)\//);
    if (m && Number(m[2]) - Number(m[1]) + 1 >= LIMITE_API) {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const cabecalhos = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const pediuFaixa = url.searchParams.has("limit") || url.searchParams.has("offset") || cabecalhos.has("range");
      if (url.pathname.includes("/rest/v1/") && !pediuFaixa) {
        console.error(
          `[LIMITE-1000] ${url.pathname.replace("/rest/v1/", "")} devolveu ${LIMITE_API} linhas sem paginação — resultado provavelmente cortado. Filtros: ${url.search.slice(0, 300)}`,
        );
      }
    }
  } catch {
    // O alarme nunca pode quebrar a requisição.
  }
  return resposta;
};
