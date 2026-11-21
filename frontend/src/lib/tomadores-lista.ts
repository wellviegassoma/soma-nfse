import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";

// Todos os tomadores de uma empresa, em ordem alfabética. Já há empresa
// com mais de 2.000 tomadores (20/11/2026) e a API corta qualquer
// resposta em 1000 linhas — sem paginar, os tomadores do fim do alfabeto
// sumiam da lista de emissão. Devolve { data } pra encaixar no
// desestruturamento dos Promise.all das páginas.
export async function listarTomadoresEmpresa<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
  colunas: string,
): Promise<{ data: T[] }> {
  const data = await buscarTudoPaginado<T>((from, to) =>
    supabase
      .from("customers")
      .select(colunas)
      .eq("company_id", companyId)
      .order("name")
      .order("id")
      .range(from, to)
      .returns<T[]>(),
  );
  return { data };
}
