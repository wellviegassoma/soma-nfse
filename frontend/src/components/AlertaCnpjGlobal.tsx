import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatarCnpj } from "@/lib/formatters";

// Faixa vermelha fixa em todas as telas do painel (pedido de 19/11/2026):
// empresa ativa no SOMA cujo CNPJ não está ATIVA na Receita (inapta,
// suspensa, baixada, nula), pela verificação diária da BrasilAPI
// (lib/situacao-cnpj.ts). Some sozinha quando o CNPJ volta a ATIVA ou a
// empresa é inativada no SOMA.
export async function AlertaCnpjGlobal() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cnpj_situacoes")
    .select("company_id, situacao, data_situacao, motivo, companies!inner(legal_name, trade_name, codigo_cliente, cnpj, ativa)")
    .eq("ok", true)
    .neq("situacao", "ATIVA")
    .eq("companies.ativa", true);
  if (error || !data?.length) return null;

  const itens = data.map((x) => {
    const c = (Array.isArray(x.companies) ? x.companies[0] : x.companies) as {
      legal_name: string;
      trade_name: string | null;
      codigo_cliente: string | null;
      cnpj: string | null;
    };
    const nome = c.trade_name || c.legal_name;
    return {
      id: x.company_id as string,
      nome: c.codigo_cliente ? `#${c.codigo_cliente} ${nome}` : nome,
      cnpj: formatarCnpj(c.cnpj),
      situacao: x.situacao as string,
      desde: x.data_situacao ? String(x.data_situacao).slice(0, 10).split("-").reverse().join("/") : null,
      motivo: x.motivo as string | null,
    };
  });

  return (
    <div role="alert" className="border-b-2 border-danger bg-danger text-white">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-sm">
        <span className="font-bold">ALERTA MÁXIMO · {itens.length} empresa(s) com CNPJ fora de ATIVA na Receita:</span>
        {itens.map((i) => (
          <Link
            key={i.id}
            href={`/admin/intimacoes?empresa=${i.id}&filtro=todas`}
            className="inline-flex flex-wrap items-baseline gap-x-1.5 underline-offset-2 hover:underline"
            title={i.motivo ?? undefined}
          >
            <span className="font-semibold">{i.nome}</span>
            {i.cnpj && <span className="font-mono text-xs text-white/85">{i.cnpj}</span>}
            <span className="rounded bg-white px-1.5 text-xs font-bold text-danger">{i.situacao}</span>
            {i.desde && <span className="text-xs text-white/85">desde {i.desde}</span>}
          </Link>
        ))}
        <Link href="/admin/intimacoes" className="ml-auto text-xs font-semibold underline">
          Ver em Intimações
        </Link>
      </div>
    </div>
  );
}
