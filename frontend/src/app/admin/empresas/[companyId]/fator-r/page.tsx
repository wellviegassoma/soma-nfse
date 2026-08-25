import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { buscarFaturamentoMensal, resolverRbt12, somarFaturamento } from "@/lib/faturamento";
import { buscarFolhaMensal, resolverFatorR, resolverFp12, totalFolhaComEncargos } from "@/lib/folha";
import { decidirAnexoFatorR } from "@/lib/calculo-impostos";
import { FolhaMensalInlineForm } from "./FolhaMensalInlineForm";
import { ImportarPgdasdForm } from "./ImportarPgdasdForm";
import { ImportarFolhaAnaliticaForm } from "./ImportarFolhaAnaliticaForm";

export const metadata = { title: "Fator R — Painel SOMA" };

const MESES_EXIBIDOS = 24;

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

// Últimas `quantidade` competências terminando em `competenciaFinal`
// (inclusive), mais recente primeiro.
function ultimosMeses(competenciaFinal: string, quantidade: number): string[] {
  const [ano, mes] = competenciaFinal.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(Date.UTC(ano, mes - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default async function FatorRPage(props: PageProps<"/admin/empresas/[companyId]/fator-r">) {
  const { companyId } = await props.params;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, tax_regime, sujeito_fator_r, rbt12_manual, rbt12_manual_competencia")
    .eq("id", companyId)
    .single();
  if (!company) notFound();

  if (company.tax_regime !== "SIMPLES_NACIONAL") {
    return (
      <div className="flex flex-col gap-6">
        <Alert tone="warning">
          Fator R só se aplica a empresas no Simples Nacional.{" "}
          <Link href={`/admin/empresas/${companyId}/dados-fiscais`} className="underline">
            Configure o regime em Dados fiscais
          </Link>
          .
        </Alert>
      </div>
    );
  }

  if (!company.sujeito_fator_r) {
    return (
      <div className="flex flex-col gap-6">
        <Alert tone="warning">
          Essa empresa não está marcada como sujeita ao Fator R — o cálculo de imposto usa direto
          o Anexo III.{" "}
          <Link href={`/admin/empresas/${companyId}/dados-fiscais`} className="underline">
            Marque em Dados fiscais
          </Link>{" "}
          se essa empresa precisa decidir entre Anexo III e V pelo Fator R.
        </Alert>
      </div>
    );
  }

  const [notas, folhaMensal] = await Promise.all([
    buscarFaturamentoMensal(supabase, companyId),
    buscarFolhaMensal(supabase, companyId),
  ]);

  const mesesComDadosReceita = new Set(notas.filter((n) => !n.cancelada).map((n) => n.competencia));
  const folhaPorMes = new Map(folhaMensal.map((f) => [f.competencia, f.valor]));
  const proLaborePorMes = new Map(folhaMensal.map((f) => [f.competencia, f.proLabore]));
  const fgtsPorMes = new Map(folhaMensal.map((f) => [f.competencia, f.fgts]));
  // Fator R oficial é sobre a "folha de salários, incluídos encargos" —
  // salários + pró-labore + FGTS do mês, não só o bruto (que é o que
  // aparece pra editar).
  const folhaComEncargosPorMes = new Map(folhaMensal.map((f) => [f.competencia, totalFolhaComEncargos(f)]));

  const competencia = mesCorrenteBrasilia();
  const meses = ultimosMeses(competencia, MESES_EXIBIDOS);

  const linhas = meses.map((mes) => {
    const { rbt12 } = resolverRbt12({
      competencia: mes,
      receitaPorMes: (m) => somarFaturamento(notas, [m]),
      mesesComDados: mesesComDadosReceita,
      rbt12Manual: company.rbt12_manual,
      rbt12ManualCompetencia: company.rbt12_manual_competencia,
    });
    const { fp12, estimado } = resolverFp12({
      competencia: mes,
      folhaPorMes: (m) => folhaComEncargosPorMes.get(m),
      mesesComDados: new Set(folhaPorMes.keys()),
    });
    const fatorR = resolverFatorR(fp12, rbt12);
    const anexo = decidirAnexoFatorR(true, fatorR);
    return {
      competencia: mes,
      folhaDoMes: folhaPorMes.get(mes) ?? null,
      proLaboreDoMes: proLaborePorMes.get(mes) ?? null,
      fgtsDoMes: fgtsPorMes.get(mes) ?? null,
      fp12,
      fp12Estimado: estimado,
      rbt12,
      fatorR,
      anexo,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fator R</h1>
        <p className="text-sm text-foreground/60">
          Folha ÷ RBT12 de cada mês — decide Anexo III (≥28%) ou Anexo V (abaixo de 28%) no
          Simples Nacional.
        </p>
      </div>

      <ImportarPgdasdForm companyId={companyId} />
      <ImportarFolhaAnaliticaForm companyId={companyId} />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-muted text-xs text-foreground/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Competência</th>
                <th className="px-4 py-3 text-left font-medium">Salários / Pró-labore / FGTS</th>
                <th className="px-4 py-3 text-left font-medium">Folha + encargos acumulados (12m)</th>
                <th className="px-4 py-3 text-left font-medium">RBT12</th>
                <th className="px-4 py-3 text-left font-medium">Fator R</th>
                <th className="px-4 py-3 text-left font-medium">Anexo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.competencia}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {formatCompetencia(linha.competencia)}
                  </td>
                  <td className="px-4 py-3">
                    <FolhaMensalInlineForm
                      companyId={companyId}
                      competencia={linha.competencia}
                      valorAtual={linha.folhaDoMes}
                      proLaboreAtual={linha.proLaboreDoMes}
                      fgtsAtual={linha.fgtsDoMes}
                    />
                  </td>
                  <td className="px-4 py-3 text-foreground/70">
                    {formatMoney(linha.fp12)}
                    {linha.fp12Estimado && (
                      <span className="ml-1 text-xs text-foreground/40">(estimada)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground/70">{formatMoney(linha.rbt12)}</td>
                  <td className="px-4 py-3 text-foreground/70">
                    {linha.fatorR != null ? formatPercent(linha.fatorR) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium text-foreground/70">
                      {linha.anexo}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
