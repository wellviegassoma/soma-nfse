import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { formatarDataHora, formatarMoeda } from "@/lib/formatters";
import { BuscarTodasButton } from "./BuscarTodasButton";
import { BuscarHistoricoTodasButton } from "./BuscarHistoricoTodasButton";
import { ExportarZipButton } from "./ExportarZipButton";

export const metadata = { title: "Fechamento — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Centrais do Fechamento agrupadas por área (17/11/2026 — o topo tinha
// virado uma fileira de botões iguais).
const GRUPOS_CENTRAIS: {
  titulo: string;
  descricao: string;
  cor: string;
  centrais: { nome: string; detalhe: string; href: string; semCompetencia?: boolean }[];
}[] = [
  {
    titulo: "Tributos federais",
    descricao: "Receita Federal via Integra Contador",
    cor: "bg-brand",
    centrais: [
      { nome: "Simples Nacional", detalhe: "Apuração, PGDAS-D, DAS e pagamento", href: "/admin/fechamento/simples" },
      { nome: "MIT · Lucro Presumido", detalhe: "PIS, COFINS, IRPJ e CSLL na DCTFWeb", href: "/admin/fechamento/mit" },
      { nome: "Situação Fiscal", detalhe: "Relatório de pendências na Receita", href: "/admin/fechamento/situacao-fiscal", semCompetencia: true },
      { nome: "Parcelamentos", detalhe: "Parcelas em aberto e guias", href: "/admin/fechamento/parcelamentos", semCompetencia: true },
    ],
  },
  {
    titulo: "ISS municipal",
    descricao: "Conferência com a Prefeitura, guia e pagamento",
    cor: "bg-success",
    centrais: [
      { nome: "ISS Rio de Janeiro", detalhe: "Nota Carioca", href: "/admin/fechamento/iss-rio" },
      { nome: "ISS Petrópolis", detalhe: "Prefeitura de Petrópolis", href: "/admin/fechamento/iss-petropolis" },
    ],
  },
  {
    titulo: "Retenções e pessoal",
    descricao: "Obrigações de quem toma serviço ou tem folha",
    cor: "bg-warning",
    centrais: [
      { nome: "Reinf", detalhe: "Retenções nas notas recebidas (R-4020, R-2010)", href: "/admin/fechamento/reinf" },
      { nome: "FGTS", detalhe: "Guias do FGTS Digital", href: "/admin/fechamento/fgts" },
      { nome: "Importar folha", detalhe: "Folha do mês para o Fator R e encargos", href: "/admin/fechamento/folha", semCompetencia: true },
    ],
  },
];

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  sucesso: { label: "OK", className: "bg-success-soft text-success" },
  erro: { label: "Erro", className: "bg-danger-soft text-danger" },
};

export default async function AdminFechamentoIndexPage(props: PageProps<"/admin/fechamento">) {
  await requirePermissao("fechamento.ver");
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam)
      ? competenciaParam
      : mesAnteriorBrasilia();

  const supabase = await createClient();
  const [{ data: companies }, { data: notasDivergentesRaw, count: totalDivergentes }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, legal_name, trade_name, codigo_cliente, cnpj, cpf, ativa, ultima_sincronizacao_em, ultima_sincronizacao_status, ultima_sincronizacao_erro",
        )
        .order("legal_name"),
      // Pega da tabela em vez de guardar só o resultado do último clique —
      // assim cobre também o que o agendamento automático diário trouxe
      // sozinho, sem alguém precisar clicar em "Buscar todas agora".
      supabase
        .from("notas_distribuidas")
        .select("numero, competencia, data_emissao, valor_servico, tomador_nome, prestador_nome, companies(legal_name, trade_name, codigo_cliente)", { count: "exact" })
        .eq("bate_competencia", false)
        .eq("cancelada", false)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  // Empresa sem certificado próprio válido também entra: a busca usa o
  // certificado da SOMA como procuradora (ver syncOneCompany).
  const empresasParaBuscar = (companies ?? [])
    .filter((c) => c.ativa && (c.cnpj || c.cpf))
    .map((c) => ({
      id: c.id,
      nome: c.codigo_cliente ? `#${c.codigo_cliente} ${c.trade_name || c.legal_name}` : c.trade_name || c.legal_name,
    }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fechamento</h1>
        <p className="text-sm text-foreground/60">
          Notas sincronizadas do Sefin Nacional, todas as empresas.
        </p>
      </div>

      {/* Notas do mês: competência + busca/exportação (o que alimenta todas as centrais). */}
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <form className="flex items-end gap-3">
            <div className="w-[170px]">
              <Field label="Competência" htmlFor="competencia">
                <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
              </Field>
            </div>
            <Button type="submit" variant="secondary">
              Aplicar
            </Button>
          </form>
          <div className="flex flex-wrap items-start gap-3">
            <BuscarTodasButton competencia={competencia} empresas={empresasParaBuscar} />
            <ExportarZipButton competencia={competencia} />
            <a href="/admin/fechamento/importar">
              <Button type="button" variant="ghost">
                Importar XML
              </Button>
            </a>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-4">
          <p className="max-w-xl text-xs text-foreground/50">
            “Buscar todas agora” traz as notas da competência no Sefin Nacional (o agendamento diário já faz isso
            sozinho). O ZIP traz, por empresa, XML e PDF de cada nota mais o relatório mensal consolidado.
          </p>
          <BuscarHistoricoTodasButton empresas={empresasParaBuscar} />
        </div>
      </Card>

      {/* Centrais por área — cada uma abre já na competência escolhida. */}
      <div className="grid gap-4 lg:grid-cols-3">
        {GRUPOS_CENTRAIS.map((grupo) => (
          <Card key={grupo.titulo} className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${grupo.cor}`} />
              <h2 className="text-sm font-semibold text-foreground">{grupo.titulo}</h2>
            </div>
            <p className="-mt-1 text-xs text-foreground/50">{grupo.descricao}</p>
            <div className="flex flex-col gap-2">
              {grupo.centrais.map((c) => (
                <Link
                  key={c.href}
                  href={`${c.href}${c.semCompetencia ? "" : `?competencia=${competencia}`}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 transition hover:border-brand/50 hover:bg-brand/5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground group-hover:text-brand">{c.nome}</span>
                    <span className="block truncate text-xs text-foreground/50">{c.detalhe}</span>
                  </span>
                  <span className="text-foreground/30 transition group-hover:translate-x-0.5 group-hover:text-brand">→</span>
                </Link>
              ))}
            </div>
          </Card>
        ))}
      </div>

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
                        {empresa?.codigo_cliente && `#${empresa.codigo_cliente} `}
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
                    {company.codigo_cliente && (
                      <span className="mr-1 text-foreground/40">#{company.codigo_cliente}</span>
                    )}
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
