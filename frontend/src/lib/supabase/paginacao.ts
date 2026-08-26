import "server-only";

// O PostgREST (por trás do Supabase) limita silenciosamente qualquer
// select sem `.range()`/`.limit()` a um número máximo de linhas por
// requisição (1000 por padrão) — passado esse limite, o resto do
// resultado simplesmente não vem, sem erro nenhum. Uma tabela que cresce
// (ex.: `notas_distribuidas`) pode cruzar esse limite silenciosamente,
// fazendo agregações "buscar tudo" (Visão geral, fechamento) perderem
// linhas mais recentes sem nenhum aviso — foi exatamente o que aconteceu
// (empresa com nota de agosto/2026 sumindo do "Faturamento por empresa"
// assim que a tabela passou de 1000 linhas). Pagina em blocos de
// `pageSize` até a página vir mais curta que o pedido, garantindo que
// nenhuma linha fique de fora independente do tamanho da tabela.
export async function buscarTudoPaginado<T>(
  buscarPagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const todos: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await buscarPagina(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todos.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return todos;
}
