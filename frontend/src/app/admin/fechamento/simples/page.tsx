import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import {
  COLUNAS_EMPRESA_SIMPLES,
  buscarExtrasConferencia,
  calcularSimplesEmpresa,
  type EmpresaSimples,
} from "@/lib/simples-linha";
import { prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";
import { SimplesLoteComSelecao } from "./SimplesLoteComSelecao";

export const metadata = { title: "Central Simples Nacional — Painel SOMA" };
export const maxDuration = 300;

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export default async function CentralSimplesPage(props: PageProps<"/admin/fechamento/simples">) {
  const searchParams = await props.searchParams;
  const competenciaParam = typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia = competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesAnteriorBrasilia();
  const periodoApuracao = competencia.replace("-", "");

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select(COLUNAS_EMPRESA_SIMPLES)
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .eq("ativa", true)
    .not("cnpj", "is", null)
    .order("legal_name")
    .returns<EmpresaSimples[]>();

  // Etapa 6 da Rotina de Fechamento: quem já fechou essa competência
  // antecipadamente (Anexo III fixo, sem Fator R) — ver
  // lib/rotina-fechamento/elegiveis-fechamento.ts pro mesmo critério
  // usado na aba Automação.
  const { data: fechadas } = await supabase
    .from("fechamentos_mensais")
    .select("company_id")
    .eq("competencia", competencia);
  const fechadasSet = new Set((fechadas ?? []).map((f) => f.company_id));

  // Última conferência com a Prefeitura (só Petrópolis hoje — ver
  // ConferirPrefeituraLoteButton) e aprovações da conferência do Simples
  // já dadas pra essa competência.
  const extras = await buscarExtrasConferencia(supabase, competencia);

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

      const prefeitura = extras.prefeitura.get(company.id) ?? null;
      const aprovacao = extras.aprovacoes.get(company.id) ?? null;
      const calculo = await calcularSimplesEmpresa(supabase, company, competencia, { prefeitura, aprovacao });

      return {
        id: company.id,
        nome: company.codigo_cliente
          ? `#${company.codigo_cliente} ${company.trade_name || company.legal_name}`
          : company.trade_name || company.legal_name,
        prefixoArquivo: prefixoArquivoEmpresa(company),
        municipioIbge: company.municipality_ibge_code,
        prefeitura,
        receitaMes: calculo.receitaMes,
        rbt12: calculo.rbt12,
        rbt12Estimado: calculo.rbt12Estimado,
        anexo: calculo.anexo,
        aliquotaEfetiva: calculo.aliquotaEfetiva,
        fatorR: calculo.fatorR,
        retencaoIrrf: calculo.retencaoIrrf,
        retencaoFederal: calculo.retencaoFederal,
        dasBruto: calculo.dasBruto,
        dasLiquido: calculo.dasLiquido,
        bloqueios: calculo.bloqueios,
        conferencia: calculo.conferencia,
        assinatura: calculo.assinatura,
        liberado: calculo.liberado,
        aprovacao,
        jaEnviado,
        podeFecharAntes: !company.sujeito_fator_r,
        jaFechada: fechadasSet.has(company.id),
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
