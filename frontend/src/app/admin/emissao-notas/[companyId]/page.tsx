import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { carregarPrefillEmissao } from "@/lib/emissao-prefill";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { EmitirNotaForm } from "@/app/empresas/[companyId]/emitir/EmitirNotaForm";

export const metadata = { title: "Emitir nota — Painel SOMA" };

export default async function AdminEmitirNotaPage(props: PageProps<"/admin/emissao-notas/[companyId]">) {
  const { companyId } = await props.params;
  const { de } = await props.searchParams;
  await requirePermissao("notas.emitir", companyId);

  const supabase = await createClient();
  const prefillPromise = carregarPrefillEmissao(supabase, companyId, de);
  const [{ data: company }, { data: customers }, { data: services }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "legal_name, trade_name, codigo_cliente, allow_retroactive_emission, tax_regime, iss_aliquota_padrao",
      )
      .eq("id", companyId)
      .maybeSingle(),
    supabase.from("customers").select("id, name, cpf_cnpj").eq("company_id", companyId).order("name"),
    supabase
      .from("services")
      .select(
        "id, name, description, tipo_retencao_issqn, iss_rate, retencao_irrf_aliquota, retencao_pis_cofins_csll_aliquota",
      )
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),
  ]);
  if (!company) notFound();

  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">
            Emitir nota — {company.codigo_cliente && `#${company.codigo_cliente} `}
            {company.trade_name || company.legal_name}
          </h1>
          <Link href="/admin/emissao-notas" className="text-sm text-foreground/60 hover:underline">
            ← Trocar empresa
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`${basePath}/tomadores/novo`}>
            <Button type="button">+ Novo tomador</Button>
          </Link>
          <Link href={`${basePath}/lote`}>
            <Button type="button" variant="secondary">
              Emitir em lote (planilha)
            </Button>
          </Link>
          <Link href={`${basePath}/notas`} className="ml-1 text-sm font-medium text-brand hover:underline">
            Ver notas já emitidas
          </Link>
        </div>
      </div>

      {!services || services.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm font-medium text-foreground/70">Nenhum serviço ativo cadastrado</p>
          <p className="mt-1 text-sm text-foreground/50">
            Cadastre um serviço pra essa empresa antes de emitir notas.
          </p>
        </Card>
      ) : (
        <EmitirNotaForm
          companyId={companyId}
          customers={customers ?? []}
          services={services}
          allowRetroactiveEmission={company.allow_retroactive_emission ?? false}
          mesCorrente={mesCorrenteBrasilia()}
          taxRegime={company.tax_regime}
          issAliquotaPadrao={company.iss_aliquota_padrao}
          prefill={await prefillPromise}
          basePath={basePath}
        />
      )}
    </div>
  );
}
