import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { CancelNotaForm } from "@/app/empresas/[companyId]/notas/[dpsId]/CancelNotaForm";

export const metadata = { title: "Nota fiscal — Painel SOMA" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateOnly(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default async function AdminNotaDetailPage(
  props: PageProps<"/admin/emissao-notas/[companyId]/notas/[dpsId]">,
) {
  const { companyId, dpsId } = await props.params;
  await requirePermissao("notas.emitir", companyId);
  const podeCancelar = await temPermissao("notas.cancelar", companyId);

  const supabase = await createClient();
  const { data: nota } = await supabase
    .from("dps")
    .select(
      "id, numero_dps, serie, valor, descricao, data_competencia, status, created_at, customer:customers(name, cpf_cnpj), service:services(name), nfse(access_key, xml_nfse, status)",
    )
    .eq("id", dpsId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!nota) notFound();

  const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
  const nfse = nfseArr[0] as
    | { access_key: string | null; xml_nfse: string | null; status: string }
    | undefined;
  const customer = Array.isArray(nota.customer) ? nota.customer[0] : nota.customer;
  const service = Array.isArray(nota.service) ? nota.service[0] : nota.service;
  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          NFS-e {nota.serie}/{nota.numero_dps}
        </h1>
        <p className="text-sm text-foreground/60">{formatDateOnly(nota.data_competencia)}</p>
      </div>

      {nota.status === "REJECTED" && (
        <Alert tone="danger">Essa nota não foi aceita pelo Sefin Nacional.</Alert>
      )}
      {nfse?.status === "CANCELADA" && <Alert tone="warning">Esta NFS-e foi cancelada.</Alert>}

      <Card className="p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-foreground/50">Tomador</dt>
            <dd className="text-sm font-medium text-foreground">{customer?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">CPF/CNPJ</dt>
            <dd className="text-sm font-medium text-foreground">{customer?.cpf_cnpj ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">Serviço</dt>
            <dd className="text-sm font-medium text-foreground">{service?.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">Valor</dt>
            <dd className="text-sm font-medium text-foreground">{formatMoney(nota.valor)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-foreground/50">Descrição</dt>
            <dd className="text-sm font-medium text-foreground">{nota.descricao}</dd>
          </div>
          {nfse?.access_key && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-foreground/50">Chave de acesso</dt>
              <dd className="break-all font-mono text-xs text-foreground/70">{nfse.access_key}</dd>
            </div>
          )}
        </dl>

        {nfse?.xml_nfse && (
          <div className="mt-6 flex gap-3">
            <a href={`/empresas/${companyId}/notas/${dpsId}/pdf`}>
              <Button>Baixar PDF</Button>
            </a>
            <a href={`/empresas/${companyId}/notas/${dpsId}/xml`} download>
              <Button variant="secondary">Baixar XML</Button>
            </a>
          </div>
        )}

        {podeCancelar && nfse?.access_key && nfse.status !== "CANCELADA" && (
          <div className="mt-6">
            <CancelNotaForm companyId={companyId} dpsId={dpsId} />
          </div>
        )}
      </Card>

      <Link href={`${basePath}/notas`} className="text-sm font-medium text-foreground/60 hover:underline">
        ← Voltar para notas fiscais
      </Link>
    </div>
  );
}
