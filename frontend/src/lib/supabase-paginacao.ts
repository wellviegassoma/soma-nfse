// O PostgREST (por trás do Supabase) limita cada resposta a 1000 linhas por
// padrão — sem paginação explícita, uma consulta que devolveria mais do que
// isso é TRUNCADA EM SILÊNCIO, sem erro nenhum. Uma soma feita em cima disso
// (saldo de conta, total do painel) fica errada sem nenhum aviso.
//
// Achado real: com o histórico de ~7.100 lançamentos da SOMA importado, o
// saldo consolidado da tela inicial saiu R$ 646.949,23 em vez de -R$ 2.273,77
// — exatamente a soma das primeiras 1000 linhas, na ordem em que o banco as
// devolveu. Nenhuma dessas páginas tinha teste com mais de algumas dezenas de
// linhas antes, então o truncamento nunca apareceu.
//
// Esta função pagina em lotes de 1000 (o próprio teto do servidor) até
// esgotar. Usar em qualquer leitura de fin_lancamentos, fin_agendamentos ou
// fin_agendamento_categorias que não tenha um .limit()/.range() explícito e
// deliberado — essas três tabelas crescem sem teto por empresa com anos de
// uso real.

const TAMANHO_PAGINA = 1000;

type ResultadoSupabase<T> = { data: T[] | null; error: { message: string } | null };

export async function paginarTudo<T>(
  construirQuery: (from: number, to: number) => PromiseLike<ResultadoSupabase<T>>,
): Promise<T[]> {
  const todos: T[] = [];
  let offset = 0;

  // Trava de segurança: 500 páginas (meio milhão de linhas) é bem mais do
  // que qualquer empresa real vai acumular tão cedo — um bug que fizesse a
  // paginação nunca esgotar (ex.: filtro que devolve sempre a mesma página)
  // vira erro visível em vez de loop infinito consumindo o banco.
  for (let pagina = 0; pagina < 500; pagina++) {
    const { data, error } = await construirQuery(offset, offset + TAMANHO_PAGINA - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
    offset += TAMANHO_PAGINA;
  }

  return todos;
}
