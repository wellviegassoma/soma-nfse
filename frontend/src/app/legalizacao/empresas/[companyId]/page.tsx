import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { STATUS_PILL_CLASSES, statusDocumento, tipoAplicavel } from "@/app/legalizacao/status";

export const metadata = { title: "Legalização — Empresa" };

export default async function LegalizacaoEmpresaPage(
  props: PageProps<"/legalizacao/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: tipos }, { data: documentos }, { data: excecoes }] =
    await Promise.all([
      supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
      supabase
        .from("legalizacao_tipos_documento")
        .select("id, nome, aplica_a_todas")
        .eq("ativo", true)
        .order("nome", { ascending: true }),
      supabase
        .from("legalizacao_documentos")
        .select("id, tipo_id, data_vencimento, nome_arquivo")
        .eq("company_id", companyId),
      supabase
        .from("legalizacao_tipos_empresas_excecao")
        .select("tipo_id, aplicavel")
        .eq("company_id", companyId),
    ]);

  if (!company) notFound();

  const documentoPorTipo = new Map((documentos ?? []).map((d) => [d.tipo_id, d]));
  const excecaoPorTipo = new Map((excecoes ?? []).map((r) => [r.tipo_id, r.aplicavel]));
  const tiposAplicaveis = (tipos ?? []).filter((t) =>
    tipoAplicavel(t.aplica_a_todas, excecaoPorTipo.get(t.id)),
  );
  const tiposNaoAplicaveisNomes = (tipos ?? [])
    .filter((t) => !tipoAplicavel(t.aplica_a_todas, excecaoPorTipo.get(t.id)))
    .map((t) => t.nome);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/legalizacao" className="text-xs text-brand underline">
            ← Voltar
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            {company.trade_name || company.legal_name}
          </h1>
          <p className="text-sm text-foreground/60">Consulta de documentos de legalização.</p>
        </div>
        <Link href={`/legalizacao/empresas/${companyId}/gerenciar`}>
          <Button variant="secondary">Gerenciar documentos</Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        {tiposAplicaveis.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhum tipo de documento aplicável a esta empresa.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tiposAplicaveis.map((tipo) => {
              const documento = documentoPorTipo.get(tipo.id);
              const status = statusDocumento(documento);
              return (
                <div
                  key={tipo.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{tipo.nome}</div>
                    {documento?.data_vencimento && (
                      <div className="text-xs text-foreground/50">
                        Vence em {new Date(documento.data_vencimento).toLocaleDateString("pt-BR")}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-xs font-medium",
                        STATUS_PILL_CLASSES[status.tone],
                      )}
                    >
                      {status.label}
                    </span>
                    {documento && (
                      <a
                        href={`/api/legalizacao/documentos/${documento.id}`}
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
        )}
      </Card>

      {tiposNaoAplicaveisNomes.length > 0 && (
        <p className="text-xs text-foreground/40">
          Não aplicáveis a esta empresa: {tiposNaoAplicaveisNomes.join(", ")}
        </p>
      )}
    </div>
  );
}
