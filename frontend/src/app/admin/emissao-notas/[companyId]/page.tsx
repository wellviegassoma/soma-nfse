import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { EmitirNotaForm } from "@/app/empresas/[companyId]/emitir/EmitirNotaForm";

export const metadata = { title: "Emitir nota — Painel SOMA" };

export default async function AdminEmitirNotaPage(
  props: PageProps<"/admin/emissao-notas/[companyId]">,
) {
  const { companyId } = await props.params;
  await requirePermissao("notas.emitir", companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: customers }, { data: services }] = await Promise.all([
    supabase
      .from("companies")
      .select("legal_name, trade_name, allow_retroactive_emission")
      .eq("id", companyId)
      .maybeSingle(),
    supabase.from("customers").select("id, name, cpf_cnpj").eq("company_id", companyId).order("name"),
    supabase
      .from("services")
      .select("id, name, description")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),
  ]);
  if (!company) notFound();

  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Emitir nota — {company.trade_name || company.legal_name}
          </h1>
          <Link href={`${basePath}/notas`} className="text-sm font-medium text-brand hover:underline">
            Ver notas já emitidas
          </Link>
        </div>
        <Link href="/admin/emissao-notas" className="text-sm text-foreground/60 hover:underline">
          ← Trocar empresa
        </Link>
      </div>

      {!services || services.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-foreground/70">Nenhum serviço ativo cadastrado</p>
          <p className="mt-1 text-sm text-foreground/50">
            Cadastre um serviço pra essa empresa antes de emitir notas.
          </p>
        </Card>
      ) : (
        <Card className="max-w-lg p-6 sm:p-8">
          <EmitirNotaForm
            companyId={companyId}
            customers={customers ?? []}
            services={services}
            allowRetroactiveEmission={company.allow_retroactive_emission ?? false}
            mesCorrente={mesCorrenteBrasilia()}
            basePath={basePath}
          />
        </Card>
      )}
    </div>
  );
}
