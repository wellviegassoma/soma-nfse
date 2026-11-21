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

// Igual a buscarTudoPaginado, mas as páginas correm em paralelo: a
// primeira pede também o total (count exact) e as demais saem todas de
// uma vez. Usar com ordem ÚNICA (ex.: .order("id")), senão páginas
// paralelas podem repetir/pular linhas.
export async function buscarTudoPaginadoParalelo<T>(
  buscarPagina: (
    from: number,
    to: number,
    contar: boolean,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null; count?: number | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const primeira = await buscarPagina(0, pageSize - 1, true);
  if (primeira.error) throw new Error(primeira.error.message);
  const dados = primeira.data ?? [];
  const total = primeira.count ?? null;
  // Sem total (não deveria acontecer): cai no caminho sequencial a partir da 2ª página.
  if (total == null) {
    if (dados.length < pageSize) return dados;
    const resto = await buscarTudoPaginado((from, to) => buscarPagina(from + pageSize, to + pageSize, false), pageSize);
    return [...dados, ...resto];
  }
  const inicios: number[] = [];
  for (let from = pageSize; from < total; from += pageSize) inicios.push(from);
  const paginas = await Promise.all(
    inicios.map(async (from) => {
      const { data, error } = await buscarPagina(from, from + pageSize - 1, false);
      if (error) throw new Error(error.message);
      return data ?? [];
    }),
  );
  return [dados, ...paginas].flat();
}
