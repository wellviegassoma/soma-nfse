import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, formatarCnpj, formatarEndereco } from "@/lib/formatters";
import { TAX_REGIME_LABELS, type Company } from "@/lib/types";
import { mesCorrenteBrasilia, ultimasCompetencias, competenciasNoIntervalo } from "@/lib/competencia";

export const metadata = { title: "Extratos — Empresa" };

const MESES_PADRAO = 6;

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export default async function ExtratosEmpresaPage(
  props: PageProps<"/extratos/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();
  const mesAtual = mesCorrenteBrasilia();

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
      .select("id, banco, codigo_banco, agencia, conta, data_inicio_controle, data_fim_controle")
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

  // Sem data de início/fim configurada, cai no padrão de sempre (últimos N
  // meses até hoje) — cada conta pode ter sua própria janela de controle.
  const padrao = ultimasCompetencias(mesAtual, MESES_PADRAO);
  const mesesPorConta = new Map(
    (contas ?? []).map((c) => {
      const inicio = c.data_inicio_controle?.slice(0, 7) ?? padrao[padrao.length - 1];
      const fim = c.data_fim_controle?.slice(0, 7) ?? mesAtual;
      return [c.id, competenciasNoIntervalo(inicio, fim)];
    }),
  );

  const contaIds = (contas ?? []).map((c) => c.id);
  const { data: extratos } = contaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("id, conta_id, competencia, entregue, nome_arquivo")
        .in("conta_id", contaIds)
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
        contas.map((conta) => {
          const meses = mesesPorConta.get(conta.id) ?? [];
          return (
            <Card key={conta.id} className="overflow-hidden">
              <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
                {conta.codigo_banco ? `${conta.codigo_banco} — ` : ""}
                {conta.banco} — Ag. {conta.agencia} / Conta {conta.conta}
              </div>
              <div className="grid grid-cols-3 gap-px bg-border sm:grid-cols-4 md:grid-cols-6">
                {meses.map((mes) => {
                  const extrato = extratoPorContaCompetencia.get(`${conta.id}-${mes}`);
                  const entregue = extrato?.entregue ?? false;
                  return (
                    <div key={mes} className="flex flex-col items-center gap-2 bg-surface px-3 py-4">
                      <span className="text-sm font-medium text-foreground">
                        {formatCompetencia(mes)}
                      </span>
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
                          className="text-xs text-brand underline"
                        >
                          ↓ Baixar
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
