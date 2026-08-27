import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarCnpj, formatarEndereco } from "@/lib/formatters";
import { TAX_REGIME_LABELS, type Company } from "@/lib/types";
import { mesCorrenteBrasilia, ultimasCompetencias } from "@/lib/competencia";

export const metadata = { title: "Extratos — Empresa" };

const MESES_EXIBIDOS = 6;

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export default async function ExtratosEmpresaPage(
  props: PageProps<"/extratos/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: contas }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trade_name, cnpj, tax_regime, address_street, address_number, address_complement, address_neighborhood, address_zip, municipality_name, state",
      )
      .eq("id", companyId)
      .single(),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, codigo_banco, agencia, conta")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
  ]);

  if (!company) notFound();
  const empresa = company as Pick<
    Company,
    | "cnpj"
    | "tax_regime"
    | "address_street"
    | "address_number"
    | "address_complement"
    | "address_neighborhood"
    | "address_zip"
    | "municipality_name"
    | "state"
  >;

  const contaIds = (contas ?? []).map((c) => c.id);
  const meses = ultimasCompetencias(mesCorrenteBrasilia(), MESES_EXIBIDOS);
  const { data: extratos } = contaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("id, conta_id, competencia, entregue, nome_arquivo")
        .in("conta_id", contaIds)
        .in("competencia", meses)
    : { data: [] };

  const extratoPorContaCompetencia = new Map(
    (extratos ?? []).map((e) => [`${e.conta_id}-${e.competencia}`, e]),
  );

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
            Consulta de contas bancárias e entrega de extrato.
          </p>
        </div>
        <Link href={`/extratos/empresas/${companyId}/gerenciar`}>
          <Button variant="primary">Gerenciar contas e extratos</Button>
        </Link>
      </div>

      <Card className="flex flex-wrap gap-x-8 gap-y-3 p-5">
        <div>
          <div className="text-xs text-foreground/50">CNPJ</div>
          <div className="text-sm font-medium text-foreground">
            {formatarCnpj(empresa.cnpj) ?? "Não cadastrado"}
          </div>
        </div>
        <div>
          <div className="text-xs text-foreground/50">Regime tributário</div>
          <div className="text-sm font-medium text-foreground">
            {empresa.tax_regime ? TAX_REGIME_LABELS[empresa.tax_regime] : "Não cadastrado"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-foreground/50">Endereço</div>
          <div className="text-sm font-medium text-foreground">
            {formatarEndereco(empresa) ?? "Não cadastrado"}
          </div>
        </div>
      </Card>

      {(!contas || contas.length === 0) ? (
        <Card className="p-6 text-center text-sm text-foreground/50">
          Nenhuma conta bancária cadastrada ainda.
        </Card>
      ) : (
        contas.map((conta) => (
          <Card key={conta.id} className="overflow-hidden">
            <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
              {conta.codigo_banco ? `${conta.codigo_banco} — ` : ""}
              {conta.banco} — Ag. {conta.agencia} / Conta {conta.conta}
            </div>
            <div className="divide-y divide-border">
              {meses.map((mes) => {
                const extrato = extratoPorContaCompetencia.get(`${conta.id}-${mes}`);
                const entregue = extrato?.entregue ?? false;
                return (
                  <div key={mes} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-sm font-medium text-foreground">
                      {formatCompetencia(mes)}
                    </span>
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          STATUS_PILL_CLASSES[entregue ? "success" : "warning"],
                        )}
                      >
                        {entregue ? "Entregue" : "Pendente"}
                      </span>
                      {extrato?.nome_arquivo && (
                        <a
                          href={`/api/extratos/mensais/${extrato.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                        >
                          ↓ Baixar
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
