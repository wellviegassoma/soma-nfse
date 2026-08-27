import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NovoDocumentoSocietarioForm } from "./NovoDocumentoSocietarioForm";
import { DeleteDocumentoSocietarioButton } from "./DeleteDocumentoSocietarioButton";
import { SocioForm } from "./SocioForm";
import { SociosList } from "./SociosList";

export const metadata = { title: "Societário — Legalização" };

export default async function SocietarioPage(
  props: PageProps<"/legalizacao/empresas/[companyId]/societario">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: documentos }, { data: socios }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("societario_documentos")
      .select("id, data_documento, descricao, nome_arquivo")
      .eq("company_id", companyId)
      .order("data_documento", { ascending: false }),
    supabase
      .from("socios")
      .select("id, tipo_pessoa, nome, documento, percentual_participacao, data_entrada, data_saida")
      .eq("company_id", companyId)
      .order("created_at", { ascending: true }),
  ]);

  if (!company) notFound();

  const socioIds = (socios ?? []).map((s) => s.id);
  const { data: sociosDocumentos } =
    socioIds.length > 0
      ? await supabase
          .from("socios_documentos")
          .select("id, socio_id, descricao, nome_arquivo")
          .in("socio_id", socioIds)
      : { data: [] };

  const documentosPorSocio = new Map<string, { id: string; descricao: string; nome_arquivo: string }[]>();
  for (const doc of sociosDocumentos ?? []) {
    if (!documentosPorSocio.has(doc.socio_id)) documentosPorSocio.set(doc.socio_id, []);
    documentosPorSocio.get(doc.socio_id)!.push(doc);
  }
  const sociosComDocumentos = (socios ?? []).map((s) => ({
    ...s,
    documentos: documentosPorSocio.get(s.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/legalizacao/empresas/${companyId}`} className="text-xs text-brand underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Societário — contrato social, alterações e sócios.
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground/70">Histórico societário</h2>
        <Card className="p-4">
          <NovoDocumentoSocietarioForm companyId={companyId} />
        </Card>
        <Card className="mt-3 overflow-hidden">
          {(!documentos || documentos.length === 0) ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              Nenhum documento societário cadastrado ainda.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {documentos.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{doc.descricao}</div>
                    <div className="text-xs text-foreground/50">
                      {new Date(doc.data_documento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <a
                      href={`/api/societario/documentos/${doc.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                    >
                      ↓ Baixar
                    </a>
                    <DeleteDocumentoSocietarioButton documentoId={doc.id} companyId={companyId} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground/70">Sócios</h2>
        <Card className="p-4">
          <SocioForm companyId={companyId} />
        </Card>
        {sociosComDocumentos.length > 0 && (
          <div className="mt-3">
            <SociosList companyId={companyId} socios={sociosComDocumentos} />
          </div>
        )}
      </div>
    </div>
  );
}
