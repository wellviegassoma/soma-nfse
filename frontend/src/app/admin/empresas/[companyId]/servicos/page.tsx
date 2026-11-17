import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ActiveToggle } from "./ActiveToggle";
import { buscarAtividade } from "@/lib/simples-nacional-atividades";

export const metadata = { title: "Serviços — Painel SOMA" };

export default async function AdminCompanyServicesPage(
  props: PageProps<"/admin/empresas/[companyId]/servicos">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: services } = await supabase
    .from("services")
    .select("id, name, national_tax_code, iss_rate, active, atividade_simples_nacional")
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
            <div key={service.id} className="flex items-center transition-colors hover:bg-surface-muted">
            <Link
              href={`/admin/empresas/${companyId}/servicos/${service.id}`}
              className="flex min-w-0 flex-1 items-center justify-between gap-4 py-4 pl-5 pr-3"
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
              {!service.atividade_simples_nacional && (
                <span className="whitespace-nowrap text-xs font-medium text-amber-700">
                  Atividade não classificada
                </span>
              )}
              {service.atividade_simples_nacional && (
                <span className="whitespace-nowrap text-xs text-foreground/40">
                  {buscarAtividade(service.atividade_simples_nacional)?.descricao.slice(0, 30)}
                </span>
              )}
              <ActiveToggle
                companyId={companyId}
                serviceId={service.id}
                active={service.active}
              />
            </Link>
            {/* Novo serviço já preenchido com os dados deste (o nome ganha "(cópia)"). */}
            <Link
              href={`/admin/empresas/${companyId}/servicos/novo?copiar=${service.id}`}
              className="mr-4 shrink-0 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground/70 hover:bg-surface-muted hover:text-foreground"
              title="Criar um serviço novo a partir deste"
            >
              Copiar
            </Link>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
