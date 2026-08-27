import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { LegalizacaoDocumentoForm } from "./LegalizacaoDocumentoForm";
import { DeleteLegalizacaoDocumentoButton } from "./DeleteLegalizacaoDocumentoButton";

export const metadata = { title: "Legalização — Empresa" };

function diasAteVencer(dataVencimento: string): number {
  return Math.ceil((new Date(dataVencimento).getTime() - Date.now()) / 86_400_000);
}

function statusFor(dataVencimento: string | null) {
  if (dataVencimento == null) return { label: "Validade indeterminada", tone: "success" as const };
  const dias = diasAteVencer(dataVencimento);
  if (dias < 0) return { label: "Vencido", tone: "danger" as const };
  if (dias <= 45) return { label: `Vence em ${dias} dia(s)`, tone: "warning" as const };
  return { label: "Válido", tone: "success" as const };
}

export default async function LegalizacaoEmpresaPage(
  props: PageProps<"/legalizacao/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: tipos }, { data: documentos }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("legalizacao_tipos_documento")
      .select("id, nome")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
    supabase
      .from("legalizacao_documentos")
      .select("id, tipo_id, data_vencimento, nome_arquivo")
      .eq("company_id", companyId),
  ]);

  if (!company) notFound();

  const documentoPorTipo = new Map((documentos ?? []).map((d) => [d.tipo_id, d]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/legalizacao" className="text-xs text-brand underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Documentos de legalização — vencimento e arquivo por tipo.
        </p>
      </div>

      {(!tipos || tipos.length === 0) && (
        <Alert tone="warning">
          Nenhum tipo de documento ativo no catálogo.{" "}
          <Link href="/legalizacao/tipos" className="underline">
            Cadastre um tipo
          </Link>{" "}
          antes de anexar documentos.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="divide-y divide-border">
          {(tipos ?? []).map((tipo) => {
            const documento = documentoPorTipo.get(tipo.id);
            const status = documento ? statusFor(documento.data_vencimento) : null;
            return (
              <div key={tipo.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground">{tipo.nome}</div>
                  {status ? (
                    <Alert tone={status.tone}>{status.label}</Alert>
                  ) : (
                    <span className="text-xs text-foreground/40">Sem documento cadastrado</span>
                  )}
                </div>
                {documento && (
                  <div className="flex items-center gap-3 text-xs text-foreground/60">
                    <a
                      href={`/api/legalizacao/documentos/${documento.id}`}
                      className="text-brand underline"
                    >
                      Baixar {documento.nome_arquivo}
                    </a>
                    <DeleteLegalizacaoDocumentoButton documentoId={documento.id} companyId={companyId} />
                  </div>
                )}
                <LegalizacaoDocumentoForm
                  companyId={companyId}
                  tipoId={tipo.id}
                  dataVencimentoAtual={documento?.data_vencimento ?? null}
                  indeterminadoAtual={documento != null && documento.data_vencimento == null}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
