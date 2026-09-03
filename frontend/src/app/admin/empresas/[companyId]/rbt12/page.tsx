import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import {
  buscarFaturamentoMensal,
  buscarReceitaManual,
  competenciasRbt12,
  receitaComManual,
  resolverRbt12,
  somarFaturamento,
} from "@/lib/faturamento";
import { ReceitaManualInlineForm } from "./ReceitaManualInlineForm";
import { ImportarPgdasdReceitaForm } from "./ImportarPgdasdReceitaForm";

export const metadata = { title: "RBT12 — Painel SOMA" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export default async function Rbt12Page(props: PageProps<"/admin/empresas/[companyId]/rbt12">) {
  const { companyId } = await props.params;
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, data_abertura, tax_regime")
    .eq("id", companyId)
    .single();
  if (!company) notFound();

  if (company.tax_regime !== "SIMPLES_NACIONAL") {
    return (
      <div className="flex flex-col gap-6">
        <Alert tone="warning">
          RBT12 só se aplica a empresas no Simples Nacional.{" "}
          <Link href={`/admin/empresas/${companyId}/dados-fiscais`} className="underline">
            Configure o regime em Dados fiscais
          </Link>
          .
        </Alert>
      </div>
    );
  }

  const [notas, receitaManualPorMes] = await Promise.all([
    buscarFaturamentoMensal(supabase, companyId),
    buscarReceitaManual(supabase, companyId),
  ]);

  const { receitaPorMes, mesesComDados, mesesManuais: mesesManuaisSet } = receitaComManual(
    notas,
    receitaManualPorMes,
  );
  const mesesComDadosReal = new Set(notas.filter((n) => !n.cancelada).map((n) => n.competencia));

  const competenciaAlvo =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesCorrenteBrasilia();
  const meses = competenciasRbt12(competenciaAlvo); // 12 meses anteriores à competência alvo, mais recente primeiro

  const { rbt12, estimado, mesesDisponiveis, mesesManuais, empresaNova } = resolverRbt12({
    competencia: competenciaAlvo,
    receitaPorMes,
    mesesComDados,
    mesesManuais: mesesManuaisSet,
    dataAbertura: company.data_abertura,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">RBT12</h1>
        <p className="text-sm text-foreground/60">
          Receita bruta acumulada nos 12 meses anteriores — base do Simples Nacional. Preencha
          competências sem nota (antes da empresa existir no sistema) ou corrija um mês que já tem
          nota, mas cuja distribuição pode estar incompleta — a distribuição de notas do Sefin
          Nacional só passou a funcionar de forma confiável a partir de dezembro/2025. Quando
          informado, o valor manual sempre tem prioridade sobre a nota.
        </p>
      </div>

      <Card className="p-6">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Field label="Competência do fechamento" htmlFor="competencia">
              <Input id="competencia" name="competencia" type="month" defaultValue={competenciaAlvo} />
            </Field>
          </div>
          <Button type="submit">Aplicar</Button>
        </form>
        <p className="mt-3 text-xs text-foreground/50">
          Escolha a competência que você está fechando pra ver/editar a janela de 12 meses que
          compõe o RBT12 dela — por padrão mostra a do mês corrente.
        </p>
      </Card>

      <ImportarPgdasdReceitaForm companyId={companyId} />

      {empresaNova && (
        <Alert tone="warning">
          Empresa com menos de 12 meses de existência — RBT12 projetado proporcionalmente a
          partir do faturamento real desde a abertura (regra oficial), sem usar faturamento
          manual. Preencher os campos abaixo não muda o cálculo enquanto isso.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">
            RBT12 ({formatCompetencia(competenciaAlvo)}){estimado ? " — estimado" : ""}
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">{formatMoney(rbt12)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Meses cobertos</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {mesesDisponiveis} de 12
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Meses com valor manual</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{mesesManuais}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Janela de 12 meses usada no RBT12 de {formatCompetencia(competenciaAlvo)}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs text-foreground/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Competência</th>
                <th className="px-4 py-3 text-left font-medium">Origem</th>
                <th className="px-4 py-3 text-left font-medium">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {meses.map((mes) => {
                const temReal = mesesComDadosReal.has(mes);
                const valorReal = temReal ? somarFaturamento(notas, [mes]) : null;
                const valorManual = receitaManualPorMes.get(mes) ?? null;
                return (
                  <tr key={mes}>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {formatCompetencia(mes)}
                    </td>
                    <td className="px-4 py-3 text-foreground/70">
                      {valorManual != null ? (
                        <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium">
                          {temReal ? "Manual (sobrepõe nota)" : "Manual"}
                        </span>
                      ) : temReal ? (
                        <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium">
                          Nota emitida
                        </span>
                      ) : (
                        <span className="text-xs text-foreground/40">Sem dado</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {valorReal != null && (
                          <span className="text-xs text-foreground/40">
                            Nota emitida: {formatMoney(valorReal)}
                          </span>
                        )}
                        <ReceitaManualInlineForm
                          companyId={companyId}
                          competencia={mes}
                          valorAtual={valorManual}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
