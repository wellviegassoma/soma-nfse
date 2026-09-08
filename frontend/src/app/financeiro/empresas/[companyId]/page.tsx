import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarDocumentoEmpresa } from "@/lib/formatters";
import { CONTA_TIPO_LABELS, type ContaTipo } from "@/lib/financeiro";
import { AtivarFinanceiroButton } from "./AtivarFinanceiroButton";

export const metadata = { title: "Financeiro — Empresa" };

type Conta = {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: ContaTipo;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
};

export default async function FinanceiroEmpresaPage(
  props: PageProps<"/financeiro/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: contasData }, { data: categorias }, { data: contatos }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name, person_type, cnpj, cpf")
        .eq("id", companyId)
        .single(),
      supabase
        .from("extrato_contas_bancarias")
        .select("id, banco, agencia, conta, tipo, saldo_inicial, data_saldo_inicial")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("created_at", { ascending: true }),
      supabase.from("fin_categorias").select("id").eq("company_id", companyId),
      supabase
        .from("fin_contatos")
        .select("id, tipo")
        .eq("company_id", companyId)
        .eq("ativo", true),
    ]);

  if (!company) notFound();

  const documento = formatarDocumentoEmpresa(company);
  const contas = (contasData ?? []) as unknown as Conta[];
  const ativo = (categorias ?? []).length > 0;
  const totalContatos = (contatos ?? []).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/financeiro" className="text-sm text-foreground/55 hover:text-foreground">
          ← Financeiro
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        {documento && (
          <p className="mt-1 text-sm text-foreground/60">
            {documento.label} {documento.valor}
          </p>
        )}
      </div>

      {!ativo ? (
        <Card className="flex flex-col items-start gap-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Financeiro ainda não ativado
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ativar cria o plano de categorias padrão desta empresa (receitas, custos,
              investimento e financiamento). A partir daí, SOMA e cliente editam o mesmo
              plano — nada aqui é compartilhado com outras empresas.
            </p>
          </div>
          <AtivarFinanceiroButton companyId={companyId} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Contas
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{contas.length}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Contatos
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{totalContatos}</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground/50">
                Categorias
              </p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {(categorias ?? []).length}
              </p>
            </Card>
          </div>

          <div className="flex flex-wrap gap-3">
            {[
              { href: "receber", label: "Contas a receber" },
              { href: "pagar", label: "Contas a pagar" },
              { href: "contas", label: "Contas e saldos" },
              { href: "conciliacao", label: "Conciliação" },
              { href: "fluxo-caixa", label: "Fluxo de caixa" },
              { href: "painel", label: "Painel de acompanhamento" },
              { href: "cobranca", label: "Cobrança" },
              { href: "orcamento", label: "Orçamento" },
              { href: "contatos", label: "Contatos" },
              { href: "config", label: "Categorias e centros de custo" },
            ].map((l) => (
              <Link
                key={l.href}
                href={`/financeiro/empresas/${companyId}/${l.href}`}
                className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted"
              >
                {l.label}
              </Link>
            ))}
          </div>

          <Card>
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Contas</h2>
              <p className="mt-0.5 text-xs text-foreground/55">
                O cadastro da conta é o mesmo do módulo Extratos — cadastrar ou remover conta
                continua sendo feito lá.
              </p>
            </div>
            {contas.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-foreground/55">
                Nenhuma conta bancária cadastrada para esta empresa.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {contas.map((conta) => (
                  <li key={conta.id} className="flex items-center justify-between gap-4 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {conta.banco}
                      </p>
                      <p className="text-xs text-foreground/50">
                        ag {conta.agencia} / cc {conta.conta} ·{" "}
                        {CONTA_TIPO_LABELS[conta.tipo] ?? conta.tipo}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs text-foreground/55">
                      {conta.data_saldo_inicial ? (
                        <>
                          <p>saldo inicial</p>
                          <p className="font-medium text-foreground">
                            {Number(conta.saldo_inicial).toLocaleString("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="text-warning">sem saldo inicial</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
