import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { formatarDataHora } from "@/lib/formatters";
import { BuscarTodasButton } from "./BuscarTodasButton";
import { BuscarHistoricoTodasButton } from "./BuscarHistoricoTodasButton";
import { ExportarZipButton } from "./ExportarZipButton";

export const metadata = { title: "Fechamento — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  sucesso: { label: "OK", className: "bg-success-soft text-success" },
  erro: { label: "Erro", className: "bg-danger-soft text-danger" },
};

export default async function AdminFechamentoIndexPage(props: PageProps<"/admin/fechamento">) {
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam)
      ? competenciaParam
      : mesCorrenteBrasilia();

  const supabase = await createClient();
  const [{ data: companies }, { data: certs }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trade_name, ultima_sincronizacao_em, ultima_sincronizacao_status, ultima_sincronizacao_erro",
      )
      .order("legal_name"),
    supabase.from("certificates").select("company_id"),
  ]);

  const idsComCertificado = new Set((certs ?? []).map((c) => c.company_id));
  const empresasComCertificado = (companies ?? [])
    .filter((c) => idsComCertificado.has(c.id))
    .map((c) => ({ id: c.id, nome: c.trade_name || c.legal_name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fechamento</h1>
        <p className="text-sm text-foreground/60">
          Notas sincronizadas do Sefin Nacional, todas as empresas.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="w-[160px]">
              <Field label="Competência" htmlFor="competencia">
                <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
              </Field>
            </div>
            <Button type="submit">Aplicar</Button>
            <ExportarZipButton competencia={competencia} />
            <a href="/admin/fechamento/importar">
              <Button type="button" variant="secondary">
                Importar XML
              </Button>
            </a>
            <a href="/admin/fechamento/mit">
              <Button type="button" variant="secondary">
                Central MIT
              </Button>
            </a>
            <a href="/admin/fechamento/simples">
              <Button type="button" variant="secondary">
                Central Simples Nacional
              </Button>
            </a>
            <a href="/admin/fechamento/situacao-fiscal">
              <Button type="button" variant="secondary">
                Central Situação Fiscal
              </Button>
            </a>
            <a href="/admin/fechamento/parcelamentos">
              <Button type="button" variant="secondary">
                Central Parcelamentos
              </Button>
            </a>
          </form>
          <BuscarTodasButton competencia={competencia} empresas={empresasComCertificado} />
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          O ZIP traz, por empresa: XML e PDF (DANFSe) de cada nota da competência, mais o
          relatório mensal consolidado. Pode demorar um pouco dependendo do volume.
        </p>
        <div className="mt-4 flex justify-end border-t border-border pt-4">
          <BuscarHistoricoTodasButton empresas={empresasComCertificado} />
        </div>
      </Card>

      <Card className="divide-y divide-border overflow-hidden">
        {!companies || companies.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">
            Nenhuma empresa cadastrada ainda.
          </div>
        ) : (
          companies.map((company) => {
            const status = company.ultima_sincronizacao_status
              ? STATUS_LABEL[company.ultima_sincronizacao_status]
              : null;
            return (
              <Link
                key={company.id}
                href={`/admin/empresas/${company.id}/fechamento?competencia=${competencia}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {company.trade_name || company.legal_name}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {company.ultima_sincronizacao_em
                      ? `Última sincronização: ${formatarDataHora(company.ultima_sincronizacao_em)}`
                      : "Nunca sincronizado"}
                  </div>
                </div>
                {status && (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                )}
              </Link>
            );
          })
        )}
      </Card>
    </div>
  );
}
