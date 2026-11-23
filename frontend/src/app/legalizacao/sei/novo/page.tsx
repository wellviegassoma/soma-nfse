import Link from "next/link";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { IBGE_PETROPOLIS } from "@/lib/sei-labels";
import { NovoProcessoManualForm } from "./NovoProcessoManualForm";

export const metadata = { title: "Processo manual — SEI — Legalização" };

export default async function NovoProcessoManualPage(props: PageProps<"/legalizacao/sei/novo">) {
  await requirePermissao("legalizacao.editar");
  const sp = await props.searchParams;
  const companyId = typeof sp.companyId === "string" ? sp.companyId : "";

  const supabase = await createClient();
  const { data: empresas, error } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, codigo_cliente")
    .eq("ativa", true)
    .or(`municipality_ibge_code.eq.${IBGE_PETROPOLIS},municipality_name.ilike.petr_polis`)
    .order("legal_name")
    .limit(5000);
  if (error) throw error;
  const preSelecionada = (empresas ?? []).find((e) => e.id === companyId) ?? null;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <Link href="/legalizacao/sei" className="text-sm text-foreground/60 hover:text-foreground">
          ← Processos do SEI
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">Cadastrar processo manualmente</h1>
        <p className="text-sm text-foreground/60">
          Para clientes de <strong>Petrópolis</strong> com processo que não aparece no acesso da SOMA: entrada feita pelo
          cliente ou outro escritório, ou protocolo físico. Clientes de outros municípios: use{" "}
          <Link href="/legalizacao/renovacoes" className="text-brand hover:underline">
            Alvarás e licenças › Renovações
          </Link>
          .
        </p>
      </div>
      <NovoProcessoManualForm empresas={empresas ?? []} preSelecionada={preSelecionada} />
    </div>
  );
}
