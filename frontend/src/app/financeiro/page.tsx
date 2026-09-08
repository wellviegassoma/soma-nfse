import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { BuscaRapidaEmpresa } from "@/components/BuscaRapidaEmpresa";

export const metadata = { title: "Financeiro — Visão geral" };

type EmpresaLinha = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  extrato_contas_bancarias: { id: string; ativo: boolean }[] | null;
  fin_categorias: { id: string }[] | null;
};

export default async function FinanceiroPage() {
  // Sem companyId: só staff SOMA e analista financeiro. O cliente entra
  // direto na própria empresa, nunca nesta lista.
  await requireFinanceiroAccess();

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select(
      "id, legal_name, trade_name, extrato_contas_bancarias(id, ativo), fin_categorias(id)",
    )
    .order("legal_name", { ascending: true });

  const empresas = (data ?? []) as unknown as EmpresaLinha[];

  // "Ativa no financeiro" = já tem plano de categorias semeado. É o marco que
  // separa as poucas empresas que usam o módulo das ~215 que só existem no
  // sistema por causa dos outros módulos — listar todas aqui seria ruído.
  const ativas = empresas.filter((e) => (e.fin_categorias ?? []).length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Financeiro</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {ativas.length} empresa{ativas.length === 1 ? "" : "s"} com financeiro ativo.
          Busque abaixo para ativar uma empresa nova.
        </p>
      </div>

      <BuscaRapidaEmpresa
        empresas={empresas}
        basePath="/financeiro/empresas"
        placeholder="Buscar empresa e abrir o financeiro..."
      />

      {ativas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/60">
          Nenhuma empresa com financeiro ativo ainda. Busque uma empresa acima para começar.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {ativas.map((empresa) => {
            const contas = (empresa.extrato_contas_bancarias ?? []).filter((c) => c.ativo);
            return (
              <Link
                key={empresa.id}
                href={`/financeiro/empresas/${empresa.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </p>
                  {empresa.trade_name && (
                    <p className="truncate text-xs text-foreground/50">{empresa.legal_name}</p>
                  )}
                </div>
                <span className="shrink-0 text-xs text-foreground/55">
                  {contas.length} conta{contas.length === 1 ? "" : "s"}
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
