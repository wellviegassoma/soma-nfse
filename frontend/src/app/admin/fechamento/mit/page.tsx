import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import {
  buscarFaturamentoMensal,
  buscarRetencoesMensal,
  competenciasTrimestre,
  somarFaturamento,
  somarRetencoes,
} from "@/lib/faturamento";
import { calcularLucroPresumido, valoresDevidosNoPeriodoMit } from "@/lib/calculo-impostos";
import { MitLoteComSelecao } from "./MitLoteComSelecao";

export const metadata = { title: "Central MIT — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

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
    .eq("ativa", true)
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
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Field label="Competência" htmlFor="competencia">
              <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
            </Field>
          </div>
          <Button type="submit">Aplicar</Button>
        </form>
      </Card>

      <MitLoteComSelecao linhas={linhas} competencia={competencia} />
    </div>
  );
}
