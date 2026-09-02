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
  buscarRetencoesMensal,
  competenciasTrimestre,
  somarFaturamento,
  somarRetencoes,
} from "@/lib/faturamento";
import { calcularLucroPresumido, valoresDevidosNoPeriodoMit } from "@/lib/calculo-impostos";
import { EnviarMitLoteButton } from "./EnviarMitLoteButton";
import { BaixarGuiasMitLoteButton } from "./BaixarGuiasMitLoteButton";

export const metadata = { title: "Central MIT — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

function formatMoney(value: number) {
  return value === 0 ? "-" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const SITUACOES_JA_ENVIADO = new Set(["ENVIADO", "ENCERRADA"]);

export default async function CentralMitPage(props: PageProps<"/admin/fechamento/mit">) {
  const searchParams = await props.searchParams;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesCorrenteBrasilia();

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, irpj_csll_apuracao_mensal")
    .eq("tax_regime", "LUCRO_PRESUMIDO")
    .not("cnpj", "is", null)
    .order("legal_name");

  const mesesTrimestre = competenciasTrimestre(competencia);
  const ehUltimoMesDoTrimestre = competencia === mesesTrimestre[2];

  const linhas = await Promise.all(
    (companies ?? []).map(async (company) => {
      let situacaoExistente: string | null = null;
      try {
        const { data } = await supabase
          .from("integra_contador_mit_encerramentos")
          .select("situacao_apuracao")
          .eq("company_id", company.id)
          .eq("competencia", competencia)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        situacaoExistente = data?.situacao_apuracao ?? null;
      } catch {
        situacaoExistente = null;
      }

      const [notas, retencoes] = await Promise.all([
        buscarFaturamentoMensal(supabase, company.id),
        buscarRetencoesMensal(supabase, company.id),
      ]);

      const receitaMes = somarFaturamento(notas, [competencia]);
      const receitaTrimestre = somarFaturamento(notas, mesesTrimestre);
      const retencaoMes = somarRetencoes(retencoes, [competencia]);
      const retencaoTrimestre = somarRetencoes(retencoes, mesesTrimestre);

      const resultado = calcularLucroPresumido({
        receitaMes,
        receitaTrimestre,
        ehUltimoMesDoTrimestre,
        apuracaoMensal: company.irpj_csll_apuracao_mensal,
        aliquotaIss: null,
      });
      const valoresMit = valoresDevidosNoPeriodoMit(resultado, retencaoMes, retencaoTrimestre);

      return {
        id: company.id,
        nome: company.trade_name || company.legal_name,
        receitaMes,
        receitaTrimestre,
        retencaoIrrf: retencaoMes.irrf,
        retencaoFederal: retencaoMes.contribuicoesSociais,
        competenciaIrpj: resultado.irpj,
        competenciaCsll: resultado.csll,
        competenciaPis: resultado.pis,
        competenciaCofins: resultado.cofins,
        mitIrpj: valoresMit.irpj,
        mitCsll: valoresMit.csll,
        mitPis: valoresMit.pis,
        mitCofins: valoresMit.cofins,
        jaEnviado: SITUACOES_JA_ENVIADO.has(situacaoExistente ?? ""),
      };
    }),
  );

  const empresasParaEnviar = linhas.filter((l) => !l.jaEnviado).map((l) => ({ id: l.id, nome: l.nome }));
  const todasAsEmpresas = linhas.map((l) => ({ id: l.id, nome: l.nome }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central de envio MIT</h1>
        <p className="text-sm text-foreground/60">
          Lucro Presumido — IRPJ/CSLL/PIS/COFINS de todas as empresas numa tela só.{" "}
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
            <EnviarMitLoteButton competencia={competencia} empresas={empresasParaEnviar} />
            <BaixarGuiasMitLoteButton competencia={competencia} empresas={todasAsEmpresas} />
          </div>
        </div>
        <p className="mt-3 text-xs text-foreground/50">
          A coluna <strong className="text-danger">MIT</strong> é o que de fato é declarado — já líquido
          de retenção e considerando se IRPJ/CSLL estão no mês de fechamento do trimestre.
        </p>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa Lucro Presumido com CNPJ cadastrada.</Alert>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="text-xs text-foreground/50">
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-left align-bottom">
                  Nome
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Faturamento Mês
                </th>
                <th rowSpan={2} className="border-b border-border px-3 py-2 text-right align-bottom">
                  Faturamento Trimestre
                </th>
                <th colSpan={2} className="border-b border-border px-3 py-1 text-center">
                  Impostos retidos
                </th>
                <th colSpan={4} className="border-b border-border px-3 py-1 text-center">
                  Referente a Competência
                </th>
                <th colSpan={4} className="border-b border-border px-3 py-1 text-center text-danger">
                  MIT
                </th>
              </tr>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-1 text-right">IRRF</th>
                <th className="border-b border-border px-3 py-1 text-right">Trib. federais</th>
                <th className="border-b border-border px-3 py-1 text-right">IRPJ</th>
                <th className="border-b border-border px-3 py-1 text-right">CSLL</th>
                <th className="border-b border-border px-3 py-1 text-right">PIS</th>
                <th className="border-b border-border px-3 py-1 text-right">COFINS</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">IRPJ</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">CSLL</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">PIS</th>
                <th className="border-b border-border px-3 py-1 text-right text-danger">COFINS</th>
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
                  </td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaMes)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.receitaTrimestre)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoIrrf)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.retencaoFederal)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaIrpj)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaCsll)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaPis)}</td>
                  <td className="px-3 py-2 text-right">{formatMoney(linha.competenciaCofins)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitIrpj)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitCsll)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitPis)}</td>
                  <td className="px-3 py-2 text-right font-medium text-danger">{formatMoney(linha.mitCofins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
