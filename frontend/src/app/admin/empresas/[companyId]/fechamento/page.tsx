import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { BuscarAgoraButton } from "./BuscarAgoraButton";

export const metadata = { title: "Fechamento — Painel SOMA" };
export const maxDuration = 300;

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

function primeiroDiaMesSeguinte(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
}

type NotaRow = {
  direcao: "saida" | "entrada" | "indefinida";
  cancelada: boolean;
  valor_servico: number | null;
  prestador_nome: string | null;
  tomador_nome: string | null;
};

export default async function AdminFechamentoPage(
  props: PageProps<"/admin/empresas/[companyId]/fechamento">,
) {
  const { companyId } = await props.params;
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam)
      ? competenciaParam
      : mesCorrenteBrasilia();

  const supabase = await createClient();

  const [{ data: company }, { data: notas }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "cnpj, ultima_sincronizacao_em, ultima_sincronizacao_status, ultima_sincronizacao_erro",
      )
      .eq("id", companyId)
      .single(),
    supabase
      .from("notas_distribuidas")
      .select("direcao, cancelada, valor_servico, prestador_nome, tomador_nome")
      .eq("company_id", companyId)
      .gte("competencia", `${competencia}-01`)
      .lt("competencia", primeiroDiaMesSeguinte(competencia)),
  ]);

  const linhas = (notas ?? []) as NotaRow[];
  const saidaAtivas = linhas.filter((n) => n.direcao === "saida" && !n.cancelada);
  const saidaCanceladas = linhas.filter((n) => n.direcao === "saida" && n.cancelada);
  const entradaAtivas = linhas.filter((n) => n.direcao === "entrada" && !n.cancelada);
  const entradaCanceladas = linhas.filter((n) => n.direcao === "entrada" && n.cancelada);
  const indefinidas = linhas.filter((n) => n.direcao === "indefinida");

  const somar = (arr: NotaRow[]) => arr.reduce((acc, n) => acc + (n.valor_servico ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {company?.ultima_sincronizacao_status === "erro" && (
        <Alert tone="warning">
          Última sincronização falhou ({company.ultima_sincronizacao_em
            ? new Date(company.ultima_sincronizacao_em).toLocaleString("pt-BR")
            : "-"}
          ): {company.ultima_sincronizacao_erro || "erro desconhecido"}. Os dados abaixo podem
          estar desatualizados.
        </Alert>
      )}
      {company?.ultima_sincronizacao_status === "sucesso" && (
        <p className="text-xs text-foreground/50">
          Última sincronização: {new Date(company.ultima_sincronizacao_em!).toLocaleString("pt-BR")}
        </p>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="w-[160px]">
              <Field label="Competência" htmlFor="competencia">
                <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
              </Field>
            </div>
            <Button type="submit">Aplicar</Button>
            {company?.cnpj && (
              <a
                href={`/admin/empresas/${companyId}/fechamento/relatorio?competencia=${competencia}`}
              >
                <Button type="button" variant="secondary">
                  Baixar relatório PDF
                </Button>
              </a>
            )}
          </form>
          <div className="flex items-center gap-3">
            <a href={`/admin/empresas/${companyId}/fechamento/importar`}>
              <Button type="button" variant="secondary">
                Importar XML
              </Button>
            </a>
            <BuscarAgoraButton companyId={companyId} competencia={competencia} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Saída (emitidas)</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{saidaAtivas.length}</div>
          <div className="text-xs text-foreground/50">{formatMoney(somar(saidaAtivas))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Entrada (recebidas)</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{entradaAtivas.length}</div>
          <div className="text-xs text-foreground/50">{formatMoney(somar(entradaAtivas))}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Canceladas</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {saidaCanceladas.length + entradaCanceladas.length}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Não classificadas</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{indefinidas.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Notas de saída — {formatCompetencia(competencia)}
        </div>
        {saidaAtivas.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">Nenhuma nota ativa.</div>
        ) : (
          <div className="divide-y divide-border">
            {saidaAtivas.map((n, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="truncate">{n.tomador_nome || "—"}</span>
                <span className="shrink-0 font-medium">{formatMoney(n.valor_servico ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Notas de entrada — {formatCompetencia(competencia)}
        </div>
        {entradaAtivas.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">Nenhuma nota ativa.</div>
        ) : (
          <div className="divide-y divide-border">
            {entradaAtivas.map((n, i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <span className="truncate">{n.prestador_nome || "—"}</span>
                <span className="shrink-0 font-medium">{formatMoney(n.valor_servico ?? 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
