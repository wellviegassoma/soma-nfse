import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import {
  buscarFaturamentoMensal,
  competenciasRbt12,
  competenciasTrimestre,
  somarFaturamento,
} from "@/lib/faturamento";
import { calcularLucroPresumido, calcularSimplesNacional } from "@/lib/calculo-impostos";

export const metadata = { title: "Impostos — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

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

export default async function ImpostosPage(
  props: PageProps<"/admin/empresas/[companyId]/impostos">,
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
  const { data: company } = await supabase
    .from("companies")
    .select(
      "id, tax_regime, sujeito_fator_r, fator_r_percentual, rbt12_manual, irpj_csll_apuracao_mensal, iss_aliquota_padrao",
    )
    .eq("id", companyId)
    .single();
  if (!company) notFound();

  const notas = await buscarFaturamentoMensal(supabase, companyId);
  const receitaMes = somarFaturamento(notas, [competencia]);

  const competenciaFilterForm = (
    <Card className="p-6">
      <form className="flex flex-wrap items-end gap-3">
        <div className="w-[160px]">
          <Field label="Competência" htmlFor="competencia">
            <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
          </Field>
        </div>
        <Button type="submit">Aplicar</Button>
      </form>
    </Card>
  );

  if (!company.tax_regime) {
    return (
      <div className="flex flex-col gap-6">
        {competenciaFilterForm}
        <Alert tone="warning">
          Essa empresa ainda não tem regime tributário definido.{" "}
          <Link href={`/admin/empresas/${companyId}/dados-fiscais`} className="underline">
            Configure em Dados fiscais
          </Link>
          .
        </Alert>
      </div>
    );
  }

  if (company.tax_regime === "LUCRO_REAL") {
    return (
      <div className="flex flex-col gap-6">
        {competenciaFilterForm}
        <Alert tone="warning">
          Cálculo de imposto para Lucro Real ainda não é suportado aqui — apura sobre o lucro
          contábil ajustado, não só sobre o faturamento.
        </Alert>
      </div>
    );
  }

  if (company.tax_regime === "SIMPLES_NACIONAL") {
    const meses12 = competenciasRbt12(competencia);
    const rbt12Bruto = somarFaturamento(notas, meses12);
    const mesesComDados = new Set(notas.filter((n) => !n.cancelada).map((n) => n.competencia));
    const mesesDisponiveis = meses12.filter((m) => mesesComDados.has(m)).length;
    const historicoInsuficiente = mesesDisponiveis < 12;
    const rbt12EstimadoPeloSistema =
      historicoInsuficiente && mesesDisponiveis > 0 ? (rbt12Bruto / mesesDisponiveis) * 12 : rbt12Bruto;
    const usandoRbt12Manual = historicoInsuficiente && company.rbt12_manual != null;
    const rbt12 = usandoRbt12Manual ? company.rbt12_manual! : rbt12EstimadoPeloSistema;
    const rbt12Estimado = historicoInsuficiente && !usandoRbt12Manual;

    const resultado = calcularSimplesNacional({
      receitaMes,
      rbt12,
      rbt12Estimado,
      sujeitoFatorR: company.sujeito_fator_r,
      fatorRPercentual: company.fator_r_percentual,
    });

    return (
      <div className="flex flex-col gap-6">
        {competenciaFilterForm}

        <Alert tone="warning">
          Estimativa com base no faturamento registrado no sistema — não substitui a apuração
          oficial no PGDAS-D.
        </Alert>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <div className="text-xs text-foreground/50">Anexo</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {resultado.anexo} — Faixa {resultado.faixa}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-foreground/50">
              RBT12{resultado.rbt12Estimado ? " (estimado)" : ""}
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(resultado.rbt12)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-foreground/50">Alíquota efetiva</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {formatPercent(resultado.aliquotaEfetiva)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-foreground/50">Faturamento ({formatCompetencia(competencia)})</div>
            <div className="mt-1 text-lg font-semibold text-foreground">
              {formatMoney(resultado.receitaMes)}
            </div>
          </Card>
        </div>

        {resultado.rbt12Estimado && (
          <Alert tone="warning">
            {mesesDisponiveis > 0
              ? `Menos de 12 meses de histórico no sistema (${mesesDisponiveis} mês(es)) — RBT12 projetado proporcionalmente.`
              : "Sem histórico de faturamento no sistema antes dessa competência — RBT12 zerado."}{" "}
            Se a empresa já faturava antes de entrar no sistema, informe o RBT12 real em{" "}
            <Link href={`/admin/empresas/${companyId}/dados-fiscais`} className="underline">
              Dados fiscais
            </Link>
            .
          </Alert>
        )}
        {usandoRbt12Manual && (
          <Alert tone="warning">
            Histórico no sistema insuficiente ({mesesDisponiveis} de 12 meses) — usando o RBT12
            informado manualmente em Dados fiscais.
          </Alert>
        )}

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            DAS estimado — {formatCompetencia(competencia)}
          </div>
          <div className="divide-y divide-border">
            {[
              { label: "IRPJ", valor: resultado.partilha.irpj },
              { label: "CSLL", valor: resultado.partilha.csll },
              { label: "COFINS", valor: resultado.partilha.cofins },
              { label: "PIS", valor: resultado.partilha.pis },
              { label: "CPP", valor: resultado.partilha.cpp },
              { label: "ISS", valor: resultado.partilha.iss },
            ].map((linha) => (
              <div key={linha.label} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-foreground/70">{linha.label}</span>
                <span className="font-medium text-foreground">{formatMoney(linha.valor)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between bg-surface-muted px-5 py-3 text-sm font-semibold">
              <span>Total do DAS</span>
              <span>{formatMoney(resultado.dasTotal)}</span>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // LUCRO_PRESUMIDO
  const mesesTrimestre = competenciasTrimestre(competencia);
  const receitaTrimestre = somarFaturamento(notas, mesesTrimestre);
  const ehUltimoMesDoTrimestre = competencia === mesesTrimestre[2];

  const resultado = calcularLucroPresumido({
    receitaMes,
    receitaTrimestre,
    ehUltimoMesDoTrimestre,
    apuracaoMensal: company.irpj_csll_apuracao_mensal,
    aliquotaIss: company.iss_aliquota_padrao,
  });

  return (
    <div className="flex flex-col gap-6">
      {competenciaFilterForm}

      <Alert tone="warning">
        Estimativa com base no faturamento registrado no sistema — não desconta retenções na
        fonte (IRRF/PIS/COFINS/CSLL retidos) nem substitui a apuração oficial.
      </Alert>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Faturamento ({formatCompetencia(competencia)})</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{formatMoney(receitaMes)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">
            Faturamento do trimestre ({formatCompetencia(mesesTrimestre[0])}–
            {formatCompetencia(mesesTrimestre[2])})
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatMoney(receitaTrimestre)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Apuração de IRPJ/CSLL</div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {resultado.apuracaoMensal ? "Mensal" : "Trimestral"}
          </div>
        </Card>
      </div>

      {!resultado.apuracaoMensal && !ehUltimoMesDoTrimestre && (
        <Alert tone="warning">
          Apuração trimestral — IRPJ/CSLL desse mês só saem na guia do último mês do trimestre (
          {formatCompetencia(mesesTrimestre[2])}). Base acumulada até aqui:{" "}
          {formatMoney(resultado.baseTrimestreIrpj)} (IRPJ).
        </Alert>
      )}

      {resultado.adicionalIrpjAplicado && (
        <Alert tone="warning">
          Base do IRPJ no trimestre passou de R$ 60.000,00 — adicional de 10% já incluído no
          valor abaixo.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Guia estimada — {formatCompetencia(competencia)}
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">IRPJ</span>
            <span className="font-medium text-foreground">{formatMoney(resultado.irpj)}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">CSLL</span>
            <span className="font-medium text-foreground">{formatMoney(resultado.csll)}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">PIS</span>
            <span className="font-medium text-foreground">{formatMoney(resultado.pis)}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">COFINS</span>
            <span className="font-medium text-foreground">{formatMoney(resultado.cofins)}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">ISS</span>
            <span className="font-medium text-foreground">
              {resultado.iss != null ? (
                formatMoney(resultado.iss)
              ) : (
                <Link
                  href={`/admin/empresas/${companyId}/dados-fiscais`}
                  className="text-xs font-normal text-brand underline"
                >
                  configurar alíquota
                </Link>
              )}
            </span>
          </div>
          <div className="flex items-center justify-between bg-surface-muted px-5 py-3 text-sm font-semibold">
            <span>Total</span>
            <span>{formatMoney(resultado.total)}</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
