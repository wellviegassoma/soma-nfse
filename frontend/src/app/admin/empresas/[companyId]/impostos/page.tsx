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
  agruparPorAtividade,
  buscarFaturamentoMensal,
  buscarFaturamentoPorAtividade,
  buscarReceitaManual,
  competenciasTrimestre,
  receitaComManual,
  resolverRbt12,
  somarFaturamento,
} from "@/lib/faturamento";
import { buscarFolhaMensal, resolverFatorR, resolverFp12, totalFolhaComEncargos } from "@/lib/folha";
import { calcularLucroPresumido, calcularSimplesNacional } from "@/lib/calculo-impostos";
import { buscarAtividade, type TratamentoAtividade } from "@/lib/simples-nacional-atividades";
import { montarDeclaracaoPgdasD } from "@/lib/pgdas-declaracao";
import { DeclararPgdasCard } from "./DeclararPgdasCard";
import { BuscarGuiaIssButton } from "./BuscarGuiaIssButton";
import { BuscarGuiaIssPetropolisButton } from "./BuscarGuiaIssPetropolisButton";

// Código IBGE do município do Rio de Janeiro — o Nota Carioca só existe
// pra empresas estabelecidas nessa cidade, e só pra quem paga ISS por
// guia própria (Lucro Presumido/Real) — quem é Simples Nacional paga o
// ISS embutido no DAS, não gera guia separada.
const IBGE_RIO_DE_JANEIRO = "3304557";
const IBGE_PETROPOLIS = "3303906";

const BADGE_POR_TRATAMENTO: Record<TratamentoAtividade, string> = {
  ANEXO_III_FIXO: "bg-green-100 text-green-900",
  FATOR_R: "bg-amber-100 text-amber-900",
  ANEXO_IV_FIXO: "bg-orange-100 text-orange-900",
};

const LABEL_POR_TRATAMENTO: Record<TratamentoAtividade, string> = {
  ANEXO_III_FIXO: "Anexo III fixo",
  FATOR_R: "Sujeita ao Fator R",
  ANEXO_IV_FIXO: "Anexo IV fixo",
};

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
      "id, cnpj, data_abertura, tax_regime, sujeito_fator_r, irpj_csll_apuracao_mensal, iss_aliquota_padrao, municipality_ibge_code",
    )
    .eq("id", companyId)
    .single();
  if (!company) notFound();

  const notas = await buscarFaturamentoMensal(supabase, companyId);
  const receitaMes = somarFaturamento(notas, [competencia]);
  const notasPorAtividade = await buscarFaturamentoPorAtividade(supabase, companyId);
  const atividadesDoMes = agruparPorAtividade(notasPorAtividade, competencia);

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

  // Só existe guia própria de ISS pra empresa que não seja Simples
  // Nacional (Simples paga o ISS embutido no DAS) — o sistema usado
  // depende do município.
  const guiaIssBotao = (
    <>
      {company.municipality_ibge_code === IBGE_RIO_DE_JANEIRO && (
        <BuscarGuiaIssButton companyId={companyId} competencia={competencia} />
      )}
      {company.municipality_ibge_code === IBGE_PETROPOLIS && (
        <BuscarGuiaIssPetropolisButton
          companyId={companyId}
          competencia={competencia}
          faturamentoSoma={receitaMes}
        />
      )}
    </>
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
        {guiaIssBotao}
      </div>
    );
  }

  if (company.tax_regime === "SIMPLES_NACIONAL") {
    const receitaManualPorMes = await buscarReceitaManual(supabase, companyId);
    const { receitaPorMes, mesesComDados, mesesManuais } = receitaComManual(notas, receitaManualPorMes);
    const {
      rbt12,
      estimado: rbt12Estimado,
      mesesDisponiveis,
      mesesManuais: rbt12MesesManuais,
      empresaNova,
    } = resolverRbt12({
      competencia,
      receitaPorMes,
      mesesComDados,
      mesesManuais,
      dataAbertura: company.data_abertura,
    });

    // Buscado sempre (não só quando sujeito_fator_r) — folhasSalario é um
    // campo opcional útil no PGDAS-D independente do Anexo do serviço.
    const folhaMensal = await buscarFolhaMensal(supabase, companyId);
    const folhaPorMes = new Map(folhaMensal.map((f) => [f.competencia, totalFolhaComEncargos(f)]));

    let fatorRPercentual: number | null = null;
    if (company.sujeito_fator_r) {
      const { fp12 } = resolverFp12({
        competencia,
        folhaPorMes: (mes) => folhaPorMes.get(mes),
        mesesComDados: new Set(folhaPorMes.keys()),
      });
      fatorRPercentual = resolverFatorR(fp12, rbt12);
    }

    const declaracaoPgdas = company.cnpj
      ? montarDeclaracaoPgdasD({
          cnpj: company.cnpj,
          competencia,
          indicadorTransmissao: false,
          tipoDeclaracao: 1,
          notas: notasPorAtividade,
          receitaPorMes,
          folhaPorMes: (mes) => folhaPorMes.get(mes),
        })
      : { dados: null, bloqueios: ["Essa empresa não tem CNPJ cadastrado."] };

    const resultado = calcularSimplesNacional({
      receitaMes,
      rbt12,
      rbt12Estimado,
      sujeitoFatorR: company.sujeito_fator_r,
      fatorRPercentual,
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

        {empresaNova && (
          <Alert tone="warning">
            Empresa com menos de 12 meses de existência ({mesesDisponiveis}{" "}
            {mesesDisponiveis === 1 ? "mês" : "meses"} desde a abertura) — RBT12 projetado
            proporcionalmente a partir do faturamento real desde a abertura (regra oficial do
            Simples Nacional).
          </Alert>
        )}
        {!empresaNova && rbt12MesesManuais > 0 && (
          <Alert tone="warning">
            RBT12 usa {rbt12MesesManuais} {rbt12MesesManuais === 1 ? "mês" : "meses"} de
            faturamento informado manualmente (competências anteriores à empresa no sistema)
            {resultado.rbt12Estimado
              ? ` — ainda faltam ${12 - mesesDisponiveis} mês(es) sem nenhum dado (nem nota, nem manual), então o RBT12 abaixo está projetado proporcionalmente pelos ${mesesDisponiveis} que já têm`
              : ""}
            . Confira ou complete na aba{" "}
            <Link href={`/admin/empresas/${companyId}/rbt12`} className="underline">
              RBT12
            </Link>
            .
          </Alert>
        )}
        {resultado.rbt12Estimado && !empresaNova && rbt12MesesManuais === 0 && (
          <Alert tone="warning">
            {mesesDisponiveis > 0
              ? `Menos de 12 meses de histórico no sistema (${mesesDisponiveis} mês(es)) — RBT12 projetado proporcionalmente.`
              : "Sem histórico de faturamento no sistema antes dessa competência — RBT12 zerado."}{" "}
            Se a empresa já faturava antes de entrar no sistema, informe o faturamento mensal
            histórico na aba{" "}
            <Link href={`/admin/empresas/${companyId}/rbt12`} className="underline">
              RBT12
            </Link>
            .
          </Alert>
        )}

        {company.sujeito_fator_r && (
          <Alert tone="warning">
            Fator R{fatorRPercentual != null ? ` (${formatPercent(fatorRPercentual)})` : ""} decidiu
            o Anexo {resultado.anexo} acima — pra ver o histórico completo mês a mês e preencher a
            folha de pagamento, acesse a aba{" "}
            <Link href={`/admin/empresas/${companyId}/fator-r`} className="underline">
              Fator R
            </Link>
            .
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

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            Faturamento por atividade — {formatCompetencia(competencia)}
          </div>
          <p className="border-b border-border bg-surface-muted px-5 py-2 text-xs text-foreground/50">
            Segregado pela classificação do Simples Nacional (Anexo III / Fator R / Anexo IV) —
            é essa a segregação que o PGDAS-D oficial exige, não o código LC 116 bruto. Notas
            ainda sem classificação resolvida aparecem por código/descrição da própria nota, pra
            você identificar o que falta cadastrar.
          </p>
          {atividadesDoMes.length === 0 ? (
            <div className="px-5 py-4 text-sm text-foreground/50">
              Nenhuma nota nessa competência.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {atividadesDoMes.map((atividade) => {
                const resolvida = atividade.atividadeId ? buscarAtividade(atividade.atividadeId) : undefined;
                return (
                  <div
                    key={atividade.chave}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <div>
                      <div className="text-foreground/70">
                        {resolvida ? resolvida.descricao : atividade.descricao}
                      </div>
                      {!resolvida && atividade.codigo && (
                        <div className="text-xs text-foreground/40">Código LC 116: {atividade.codigo}</div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {resolvida ? (
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium ${BADGE_POR_TRATAMENTO[resolvida.tratamento]}`}
                          >
                            {LABEL_POR_TRATAMENTO[resolvida.tratamento]}
                            {atividade.viaSugestao ? " (sugestão automática — conferir)" : ""}
                          </span>
                        ) : (
                          <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground/50">
                            Não classificado
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-medium text-foreground">{formatMoney(atividade.valor)}</span>
                  </div>
                );
              })}
              <div className="flex items-center justify-between bg-surface-muted px-5 py-3 text-sm font-semibold">
                <span>Total</span>
                <span>{formatMoney(atividadesDoMes.reduce((acc, a) => acc + a.valor, 0))}</span>
              </div>
            </div>
          )}
        </Card>

        <DeclararPgdasCard
          companyId={companyId}
          competencia={competencia}
          bloqueios={declaracaoPgdas.bloqueios}
        />
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
          IRPJ e CSLL abaixo são a estimativa desse mês — como a apuração é trimestral, o DARF de
          verdade só sai no fechamento do trimestre ({formatCompetencia(mesesTrimestre[2])}),
          somando os 3 meses. Base acumulada do trimestre até aqui:{" "}
          {formatMoney(resultado.baseTrimestreIrpj)} (IRPJ).
        </Alert>
      )}

      {resultado.adicionalIrpjAplicado && (
        <Alert tone="warning">
          Base do IRPJ no trimestre passou de R$ 60.000,00 — o adicional de 10% aparece
          destacado numa linha própria abaixo.
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Guia estimada — {formatCompetencia(competencia)}
        </div>
        <div className="divide-y divide-border">
          <div className="flex items-center justify-between px-5 py-3 text-sm">
            <span className="text-foreground/70">IRPJ (15%)</span>
            <span className="font-medium text-foreground">{formatMoney(resultado.irpjBase)}</span>
          </div>
          {resultado.irpjAdicional > 0 && (
            <div className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="text-foreground/70">Adicional de IRPJ (10%)</span>
              <span className="font-medium text-foreground">
                {formatMoney(resultado.irpjAdicional)}
              </span>
            </div>
          )}
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

      {guiaIssBotao}
    </div>
  );
}
