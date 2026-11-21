import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { statusDocumento, tipoAplicavel } from "@/app/legalizacao/status";
import { LegalizacaoDocumentoForm } from "../LegalizacaoDocumentoForm";
import { DeleteLegalizacaoDocumentoButton } from "../DeleteLegalizacaoDocumentoButton";
import { TipoAplicavelToggle } from "../TipoAplicavelToggle";
import { regraAplicavel, type RegraVencimento } from "@/lib/legalizacao-licencas";

export const metadata = { title: "Legalização — Gerenciar documentos" };

export default async function LegalizacaoGerenciarPage(
  props: PageProps<"/legalizacao/empresas/[companyId]/gerenciar">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [
    { data: company },
    { data: tipos },
    { data: documentos },
    { data: excecoes },
    { data: regras },
    { data: historico },
  ] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name, codigo_cliente, municipality_ibge_code, municipality_name, state")
        .eq("id", companyId)
        .single(),
      supabase
        .from("legalizacao_tipos_documento")
        .select("id, nome, aplica_a_todas")
        .eq("ativo", true)
        .order("nome", { ascending: true }),
      supabase
        .from("legalizacao_documentos")
        .select("id, tipo_id, numero, orgao, data_emissao, data_vencimento, nome_arquivo")
        .eq("company_id", companyId),
      supabase
        .from("legalizacao_tipos_empresas_excecao")
        .select("tipo_id, aplicavel")
        .eq("company_id", companyId),
      supabase.from("legalizacao_regras_vencimento").select("*"),
      supabase
        .from("legalizacao_documentos_historico")
        .select("id, tipo_id, numero, data_emissao, data_vencimento, nome_arquivo, substituido_em")
        .eq("company_id", companyId)
        .order("substituido_em", { ascending: false }),
    ]);

  if (!company) notFound();

  const documentoPorTipo = new Map((documentos ?? []).map((d) => [d.tipo_id, d]));
  const excecaoPorTipo = new Map((excecoes ?? []).map((r) => [r.tipo_id, r.aplicavel]));
  const historicoPorTipo = new Map<string, NonNullable<typeof historico>>();
  for (const h of historico ?? []) {
    historicoPorTipo.set(h.tipo_id, [...(historicoPorTipo.get(h.tipo_id) ?? []), h]);
  }
  const dataBr = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/legalizacao/empresas/${companyId}`}
          className="text-xs text-brand underline"
        >
          ← Voltar para consulta
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.codigo_cliente && (
            <span className="mr-1.5 text-foreground/40">#{company.codigo_cliente}</span>
          )}
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Gerenciar documentos de legalização — vencimento, arquivo e aplicabilidade por tipo.
        </p>
        <p className="mt-1 text-xs text-foreground/50">
          Município:{" "}
          {company.municipality_name
            ? `${company.municipality_name}${company.state ? `/${company.state}` : ""}`
            : "não cadastrado — sem ele a regra de vencimento do município não é aplicada"}
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

      <div className="flex flex-col gap-4">
        {(tipos ?? []).map((tipo) => {
          const documento = documentoPorTipo.get(tipo.id);
          const anteriores = historicoPorTipo.get(tipo.id) ?? [];
          const regra = regraAplicavel(
            (regras ?? []) as RegraVencimento[],
            tipo.id,
            company.municipality_ibge_code,
          );
          const status = statusDocumento(documento);
          const aplicavel = tipoAplicavel(tipo.aplica_a_todas, excecaoPorTipo.get(tipo.id));
          const colapsado = !aplicavel && !documento;

          return (
            <Card key={tipo.id} className={colapsado ? "bg-surface-muted/40" : ""}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{tipo.nome}</span>
                  {!colapsado && (
                    <Alert tone={status.tone === "neutral" ? "warning" : status.tone}>
                      {status.label}
                    </Alert>
                  )}
                </div>
                <TipoAplicavelToggle companyId={companyId} tipoId={tipo.id} aplicavel={aplicavel} />
              </div>

              {colapsado ? (
                <div className="px-5 py-3.5 text-xs text-foreground/40">
                  Este tipo não se aplica a esta empresa — nenhum documento é exigido.
                </div>
              ) : (
                <div className="flex flex-col gap-3 px-5 py-4">
                  {documento && (
                    <div className="flex flex-wrap items-center gap-3">
                      <a
                        href={`/api/legalizacao/documentos/${documento.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted"
                      >
                        ↓ {documento.nome_arquivo}
                      </a>
                      <DeleteLegalizacaoDocumentoButton
                        documentoId={documento.id}
                        companyId={companyId}
                      />
                    </div>
                  )}
                  {documento && (documento.numero || documento.orgao || documento.data_emissao) && (
                    <div className="text-xs text-foreground/60">
                      {[
                        documento.numero && `Nº ${documento.numero}`,
                        documento.orgao,
                        documento.data_emissao && `emitida em ${dataBr(documento.data_emissao)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  <LegalizacaoDocumentoForm
                    key={documento ? `${documento.id}-${documento.nome_arquivo}` : "novo"}
                    companyId={companyId}
                    tipoId={tipo.id}
                    documentoAtual={documento ?? null}
                    regra={regra}
                  />
                  {anteriores.length > 0 && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-foreground/60">
                        Histórico ({anteriores.length} licença(s) anterior(es))
                      </summary>
                      <div className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border">
                        {anteriores.map((h) => (
                          <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                            <span className="text-foreground/70">
                              {h.numero ? `Nº ${h.numero} · ` : ""}
                              {h.data_emissao ? `emitida ${dataBr(h.data_emissao)} · ` : ""}
                              {h.data_vencimento ? `venceu ${dataBr(h.data_vencimento)}` : "validade indeterminada"}
                            </span>
                            <a
                              href={`/api/legalizacao/documentos/${h.id}`}
                              className="font-medium text-brand hover:underline"
                            >
                              ↓ {h.nome_arquivo}
                            </a>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
