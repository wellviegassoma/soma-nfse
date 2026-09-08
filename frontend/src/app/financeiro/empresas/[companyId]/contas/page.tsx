import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarBRL, formatarDataBr } from "@/lib/financeiro";
import { CONTA_TIPO_LABELS, type ContaTipo } from "@/lib/financeiro";
import { TransferenciaForm } from "@/components/financeiro/TransferenciaForm";
import { ContaDadosForm } from "./ContaDadosForm";
import { paginarTudo } from "@/lib/supabase-paginacao";

export const metadata = { title: "Financeiro — Contas e saldos" };

type Conta = {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: ContaTipo;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
};

type Lancamento = { conta_id: string; data: string; valor: number };

export default async function ContasPage(
  props: PageProps<"/financeiro/empresas/[companyId]/contas">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: contasData }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, agencia, conta, tipo, saldo_inicial, data_saldo_inicial")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("banco"),
  ]);

  if (!company) notFound();
  const contas = (contasData ?? []) as unknown as Conta[];

  // fin_lancamentos não tem teto por empresa (a SOMA já tem ~7.100 de
  // histórico real) — sem paginar, o PostgREST corta em 1000 linhas sem
  // avisar, e o saldo somado abaixo ficaria errado em silêncio. Achado ao
  // vivo nesta mesma tela antes desta correção.
  const lancamentos = await paginarTudo<Lancamento>((from, to) =>
    supabase
      .from("fin_lancamentos")
      .select("conta_id, data, valor")
      .eq("company_id", companyId)
      .range(from, to),
  );

  // Mesmo cálculo da função fin_saldo_conta no banco: saldo inicial +
  // lançamentos a partir da data do saldo inicial. Feito aqui pra listar todas
  // as contas numa consulta só, em vez de uma chamada de RPC por conta.
  const saldoPorConta = new Map<string, number>();
  for (const c of contas) saldoPorConta.set(c.id, Number(c.saldo_inicial));
  for (const l of lancamentos) {
    const conta = contas.find((c) => c.id === l.conta_id);
    if (!conta) continue;
    if (conta.data_saldo_inicial && l.data < conta.data_saldo_inicial) continue;
    saldoPorConta.set(l.conta_id, (saldoPorConta.get(l.conta_id) ?? 0) + Number(l.valor));
  }
  const saldoTotal = [...saldoPorConta.values()].reduce((s, v) => s + v, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Contas e saldos</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Saldo consolidado: <strong className="text-foreground">{formatarBRL(saldoTotal)}</strong>.
          O cadastro da conta em si continua no módulo Extratos.
        </p>
      </div>

      {contas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhuma conta bancária cadastrada. Cadastre no módulo Extratos.
        </Card>
      ) : (
        <>
          <Card className="divide-y divide-border">
            {contas.map((conta) => (
              <div key={conta.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{conta.banco}</p>
                    <p className="text-xs text-foreground/50">
                      ag {conta.agencia} / cc {conta.conta} ·{" "}
                      {CONTA_TIPO_LABELS[conta.tipo] ?? conta.tipo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatarBRL(saldoPorConta.get(conta.id) ?? 0)}
                    </p>
                    <p className="text-xs text-foreground/45">
                      {conta.data_saldo_inicial
                        ? `desde ${formatarDataBr(conta.data_saldo_inicial)}`
                        : "sem saldo inicial definido"}
                    </p>
                  </div>
                </div>
                <ContaDadosForm companyId={companyId} conta={conta} />
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-foreground">
              Transferência entre contas
            </h2>
            <TransferenciaForm companyId={companyId} contas={contas} />
          </Card>
        </>
      )}
    </div>
  );
}
