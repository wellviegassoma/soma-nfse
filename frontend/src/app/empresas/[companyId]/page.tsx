import Link from "next/link";
import { getCompanyAccess, getCurrentProfileName } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ROLE_LABELS } from "@/lib/types";
import { formatarDocumentoEmpresa } from "@/lib/formatters";
import type { DpsListItem } from "@/lib/types";

export const metadata = { title: "Painel — SOMA Gestão" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function CompanyDashboardPage(
  props: PageProps<"/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const [access, userName] = await Promise.all([
    getCompanyAccess(companyId),
    getCurrentProfileName(),
  ]);

  if (!access) return null; // o layout já redireciona antes de chegar aqui

  const { company, role } = access;

  const supabase = await createClient();
  const { data: ultimasNotas } = await supabase
    .from("dps")
    .select(
      "id, numero_dps, serie, valor, data_competencia, status, created_at, customer:customers(name), service:services(name), nfse(access_key)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(5);

  const lista = (ultimasNotas ?? []) as unknown as DpsListItem[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Olá{userName ? `, ${userName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-foreground/60">
            {company.trade_name || company.legal_name} · {ROLE_LABELS[role]}
          </p>
        </div>
        <Link href={`/empresas/${companyId}/emitir`}>
          <Button size="lg">+ Emitir nota</Button>
        </Link>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/70">
            Últimas notas
          </h2>
          <Link
            href={`/empresas/${companyId}/notas`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Ver todas
          </Link>
        </div>
        {lista.length === 0 ? (
          <p className="text-sm text-foreground/50">Nenhuma nota emitida ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {lista.map((nota) => (
              <li key={nota.id}>
                <Link
                  href={`/empresas/${companyId}/notas/${nota.id}`}
                  className="flex items-center justify-between py-3 text-sm hover:opacity-70"
                >
                  <span className="text-foreground">
                    {nota.customer?.name ?? "—"} · {nota.service?.name ?? "—"}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatMoney(nota.valor)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">
          Dados da empresa
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-foreground/50">Razão social</dt>
            <dd className="text-sm font-medium text-foreground">
              {company.legal_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">Nome fantasia</dt>
            <dd className="text-sm font-medium text-foreground">
              {company.trade_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">
              {company.person_type === "PF" ? "CPF" : "CNPJ"}
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {formatarDocumentoEmpresa(company)?.valor ?? "Ainda não cadastrado"}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
