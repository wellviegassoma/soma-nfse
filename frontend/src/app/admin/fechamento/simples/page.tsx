import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import {
  buscarFaturamentoMensal,
  buscarFaturamentoPorAtividade,
  buscarReceitaManual,
  buscarRetencoesMensal,
  receitaComManual,
  resolverRbt12,
  somarFaturamento,
  somarRetencoes,
} from "@/lib/faturamento";
import { buscarFolhaMensal, resolverFatorR, resolverFp12, totalFolhaComEncargos } from "@/lib/folha";
import { abaterRetencaoDoDas, calcularSimplesNacional } from "@/lib/calculo-impostos";
import { montarDeclaracaoPgdasD } from "@/lib/pgdas-declaracao";
import { EnviarSimplesLoteButton } from "./EnviarSimplesLoteButton";
import { BaixarGuiasSimplesLoteButton } from "./BaixarGuiasSimplesLoteButton";

export const metadata = { title: "Central Simples Nacional — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

function formatMoney(value: number) {
  return value === 0 ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export default async function CentralSimplesPage(props: PageProps<"/admin/fechamento/simples">) {
  const searchParams = await props.searchParams;
  const competenciaParam = typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia = competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesCorrenteBrasilia();
  const periodoApuracao = competencia.replace("-", "");

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, data_abertura, sujeito_fator_r")
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .not("cnpj", "is", null)
    .order("legal_name");

  const linhas = await Promise.all(
    (companies ?? []).map(async (company) => {
      let jaEnviado = false;
      try {
        const { data } = await supabase
          .from("integra_contador_pgdas_declaracoes")
          .select("id_declaracao")
          .eq("company_id", company.id)
          .eq("competencia", competencia)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        jaEnviado = Boolean(data?.id_declaracao);
      } catch {
        jaEnviado = false;
      }

      const [notasMensais, notasPorAtividade, receitaManualPorMes, folhaMensal, retencoes] = await Promise.all([
        buscarFaturamentoMensal(supabase, company.id),
        buscarFaturamentoPorAtividade(supabase, company.id),
        buscarReceitaManual(supabase, company.id),
        buscarFolhaMensal(supabase, company.id),
        buscarRetencoesMensal(supabase, company.id),
      ]);

      const { receitaPorMes, mesesComDados, mesesManuais } = receitaComManual(notasMensais, receitaManualPorMes);
      const { rbt12, estimado: rbt12Estimado } = resolverRbt12({
        competencia,
        receitaPorMes,
        mesesComDados,
        mesesManuais,
        dataAbertura: company.data_abertura,
      });

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

      const receitaMes = somarFaturamento(notasMensais, [competencia]);
      const resultado = calcularSimplesNacional({
        receitaMes,
        rbt12,
        rbt12Estimado,
        sujeitoFatorR: company.sujeito_fator_r,
        fatorRPercentual,
      });

      const retencaoMes = somarRetencoes(retencoes, [competencia]);
      const liquido = abaterRetencaoDoDas(resultado, retencaoMes);

      const declaracao = montarDeclaracaoPgdasD({
        cnpj: company.cnpj!,
        competencia,
        indicadorTransmissao: false,
        tipoDeclaracao: 1,
        notas: notasPorAtividade,
        receitaPorMes,
        folhaPorMes: (mes) => folhaPorMes.get(mes),
      });

      return {
        id: company.id,
        nome: company.trade_name || company.legal_name,
        receitaMes,
        rbt12,
        rbt12Estimado,
        anexo: resultado.anexo,
        aliquotaEfetiva: resultado.aliquotaEfetiva,
        retencaoIrrf: retencaoMes.irrf,
        retencaoFederal: retencaoMes.contribuicoesSociais,
        dasBruto: resultado.dasTotal,
        dasLiquido: liquido.dasTotal,
        bloqueios: declaracao.bloqueios,
        jaEnviado,
      };
    }),
  );

  const empresasParaEnviar = linhas
    .filter((l) => !l.jaEnviado && l.bloqueios.length === 0)
    .map((l) => ({ id: l.id, nome: l.nome }));
  const todasAsEmpresas = linhas.map((l) => ({ id: l.id, nome: l.nome }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central Simples Nacional</h1>
        <p className="text-sm text-foreground/60">
          Conferência e envio em lote do PGDAS-D de todas as empresas do Simples Nacional.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
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
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <EnviarSimplesLoteButton competencia={competencia} empresas={empresasParaEnviar} />
            <BaixarGuiasSimplesLoteButton competencia={competencia} periodoApuracao={periodoApuracao} empresas={todasAsEmpresas} />
          </div>
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          A coluna <strong className="text-danger">DAS líquido</strong> é o valor que de fato seria
          transmitido no PGDAS-D — já líquido de retenção sofrida. Empresas com pendência de
          classificação de atividade ficam de fora do envio em lote até serem corrigidas.
        </p>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa Simples Nacional com CNPJ cadastrada.</Alert>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-xs text-foreground/50">
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-left align-bottom">
                  Nome
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Faturamento Mês
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  RBT12
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-center align-bottom">
                  Anexo
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Alíquota
                </th>
                <th colSpan={2} className="border-b border-border px-3 py-1 text-center">
                  Impostos retidos
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  DAS bruto
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom text-danger">
                  DAS líquido
                </th>
              </tr>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-1 text-right">IRRF</th>
                <th className="border-b border-border px-3 py-1 text-right">Trib. federais</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.id}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {linha.nome}
                    {linha.jaEnviado && (
                      <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                        enviado
                      </span>
                    )}
                    {linha.bloqueios.length > 0 && (
                      <span
                        className="ml-2 rounded bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger"
                        title={linha.bloqueios.join(" ")}
                      >
                        {linha.bloqueios.length === 1 ? "1 pendência" : `${linha.bloqueios.length} pendências`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaMes)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(linha.rbt12)}
                    {linha.rbt12Estimado && <span className="ml-1 text-[10px] text-foreground/40">(est.)</span>}
                  </td>
                  <td className="px-3 py-2 text-center">{linha.anexo}</td>
                  <td className="px-3 py-2 text-right">{formatPercent(linha.aliquotaEfetiva)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoIrrf)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoFederal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.dasBruto)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.dasLiquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
