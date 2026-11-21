import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listarTomadoresEmpresa } from "@/lib/tomadores-lista";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Tomadores — SOMA Gestão" };

export default async function TomadoresPage(
  props: PageProps<"/empresas/[companyId]/tomadores">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: customers } = await listarTomadoresEmpresa<{
    id: string;
    name: string;
    cpf_cnpj: string | null;
    type: string;
    city: string | null;
    state: string | null;
  }>(supabase, companyId, "id, name, cpf_cnpj, type, city, state");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Tomadores</h1>
          <p className="text-sm text-foreground/60">
            {customers?.length ?? 0} cadastrado(s)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/empresas/${companyId}/tomadores/importar`}>
            <Button variant="secondary">Importar de XML</Button>
          </Link>
          <Link href={`/empresas/${companyId}/tomadores/novo`}>
            <Button>+ Novo tomador</Button>
          </Link>
        </div>
      </div>

      {!customers || customers.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum tomador cadastrado ainda.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/empresas/${companyId}/tomadores/${customer.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {customer.name}
                </div>
                <div className="truncate text-xs text-foreground/50">
                  {customer.cpf_cnpj || `${customer.type} sem documento`}
                </div>
              </div>
              {customer.city && (
                <div className="shrink-0 text-xs text-foreground/50">
                  {customer.city}
                  {customer.state ? `/${customer.state}` : ""}
                </div>
              )}
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
