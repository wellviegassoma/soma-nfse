import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { mesCorrenteBrasilia } from "@/lib/competencia";

export const metadata = { title: "Extratos — Empresa" };

export default async function ExtratosEmpresaPage(
  props: PageProps<"/extratos/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();
  const competenciaAtual = mesCorrenteBrasilia();

  const [{ data: company }, { data: contas }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, codigo_banco, agencia, conta")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
  ]);

  if (!company) notFound();

  const contaIds = (contas ?? []).map((c) => c.id);
  const { data: extratosDoMes } = contaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("conta_id, entregue")
        .eq("competencia", competenciaAtual)
        .in("conta_id", contaIds)
    : { data: [] };

  const entregaPorConta = new Map((extratosDoMes ?? []).map((e) => [e.conta_id, e.entregue]));
  const [ano, mes] = competenciaAtual.split("-");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/extratos" className="text-xs text-brand underline">
            ← Voltar
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {company.trade_name || company.legal_name}
          </h1>
          <p className="text-sm text-foreground/60">
            Consulta de contas bancárias e entrega de extrato — competência {mes}/{ano}.
          </p>
        </div>
        <Link href={`/extratos/empresas/${companyId}/gerenciar`}>
          <Button variant="primary">Gerenciar contas e extratos</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        {(!contas || contas.length === 0) ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhuma conta bancária cadastrada ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {contas.map((conta) => {
              const entregue = entregaPorConta.get(conta.id) ?? false;
              return (
                <div key={conta.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {conta.codigo_banco ? `${conta.codigo_banco} — ` : ""}
                      {conta.banco}
                    </div>
                    <div className="text-xs text-foreground/50">
                      Ag. {conta.agencia} / Conta {conta.conta}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      entregue ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
                    )}
                  >
                    {entregue ? "Extrato entregue este mês" : "Extrato pendente este mês"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
