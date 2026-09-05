import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { formatarDataHora, formatarMoeda } from "@/lib/formatters";
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
  const [{ data: companies }, { data: certs }, { data: notasDivergentesRaw, count: totalDivergentes }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, legal_name, trade_name, ultima_sincronizacao_em, ultima_sincronizacao_status, ultima_sincronizacao_erro",
        )
        .order("legal_name"),
      supabase.from("certificates").select("company_id"),
      // Pega da tabela em vez de guardar só o resultado do último clique —
      // assim cobre também o que o agendamento automático diário trouxe
      // sozinho, sem alguém precisar clicar em "Buscar todas agora".
      supabase
        .from("notas_distribuidas")
        .select("numero, competencia, data_emissao, valor_servico, tomador_nome, prestador_nome, companies(legal_name, trade_name)", { count: "exact" })
        .eq("bate_competencia", false)
        .eq("cancelada", false)
        .order("created_at", { ascending: false })
        .limit(200),
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

      {notasDivergentesRaw && notasDivergentesRaw.length > 0 && (
        <Card className="border-warning/30 bg-warning-soft/40 p-6">
          <div className="text-sm font-semibold text-warning">
            Notas com competência divergente da emissão — {totalDivergentes ?? notasDivergentesRaw.length}
          </div>
          <p className="mt-1 text-xs text-foreground/60">
            A competência informada é de um mês diferente do mês real da emissão — inclui tudo que
            foi encontrado assim (busca manual ou o agendamento automático diário), não só o
            último clique em &ldquo;Buscar todas agora&rdquo;. Pode gerar imposto retroativo num
            período que já foi fechado; vale conferir cada uma.
          </p>
          <div className="mt-3 max-h-96 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-warning-soft">
                <tr className="text-xs text-foreground/50">
                  <th className="pr-4 py-1 font-medium">Empresa</th>
                  <th className="pr-4 py-1 font-medium">Nota</th>
                  <th className="pr-4 py-1 font-medium">Emitida em</th>
                  <th className="pr-4 py-1 font-medium">Competência informada</th>
                  <th className="pr-4 py-1 font-medium">Valor</th>
                  <th className="pr-4 py-1 font-medium">Tomador/Prestador</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {notasDivergentesRaw.map((n, i) => {
                  const empresa = Array.isArray(n.companies) ? n.companies[0] : n.companies;
                  return (
                    <tr key={i}>
                      <td className="pr-4 py-1.5">
                        {empresa?.trade_name || empresa?.legal_name || "—"}
                      </td>
                      <td className="pr-4 py-1.5">{n.numero ?? "—"}</td>
                      <td className="pr-4 py-1.5">
                        {n.data_emissao ? new Date(n.data_emissao).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="pr-4 py-1.5">{n.competencia ?? "—"}</td>
                      <td className="pr-4 py-1.5">
                        {n.valor_servico != null ? formatarMoeda(n.valor_servico) : "—"}
                      </td>
                      <td className="pr-4 py-1.5">{n.tomador_nome || n.prestador_nome || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
