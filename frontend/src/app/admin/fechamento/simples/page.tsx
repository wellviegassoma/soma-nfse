import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
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
import { SimplesLoteComSelecao } from "./SimplesLoteComSelecao";

export const metadata = { title: "Central Simples Nacional — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

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
    .eq("ativa", true)
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
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Field label="Competência" htmlFor="competencia">
              <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
            </Field>
          </div>
          <Button type="submit">Aplicar</Button>
        </form>
      </Card>

      <SimplesLoteComSelecao linhas={linhas} competencia={competencia} periodoApuracao={periodoApuracao} />
    </div>
  );
}
