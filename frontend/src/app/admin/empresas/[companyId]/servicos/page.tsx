import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ActiveToggle } from "./ActiveToggle";

export const metadata = { title: "Serviços — Painel SOMA" };

export default async function AdminCompanyServicesPage(
  props: PageProps<"/admin/empresas/[companyId]/servicos">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, national_tax_code, iss_rate, active")
    .eq("company_id", companyId)
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          {services?.length ?? 0} serviço(s) cadastrado(s)
        </p>
        <Link href={`/admin/empresas/${companyId}/servicos/novo`}>
          <Button>+ Novo serviço</Button>
        </Link>
      </div>

      {!services || services.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum serviço cadastrado ainda.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {services.map((service) => (
            <Link
              key={service.id}
              href={`/admin/empresas/${companyId}/servicos/${service.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {service.name}
                </div>
                <div className="truncate text-xs text-foreground/50">
                  {service.national_tax_code || "sem código tributário"}
                  {service.iss_rate != null && ` · ISS ${service.iss_rate}%`}
                </div>
              </div>
              <ActiveToggle
                companyId={companyId}
                serviceId={service.id}
                active={service.active}
              />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
