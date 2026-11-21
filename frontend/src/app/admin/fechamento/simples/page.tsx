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
  carregarDadosSimplesLote,
  type EmpresaSimples,
} from "@/lib/simples-linha";
import { prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";
import { SimplesLoteComSelecao } from "./SimplesLoteComSelecao";
import { buscarDasPagamentos } from "@/lib/pagamentos-federais";

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
  const companyIds = (companies ?? []).map((c) => c.id);

  // Tudo de uma vez, em paralelo: antes eram ~10 consultas por empresa
  // (cada uma esperando a anterior entrar na fila) e a tela levava ~9 s.
  const [{ data: fechadas }, extras, dasPagamentos, declaracoes, dadosPorEmpresa] = await Promise.all([
    supabase.from("fechamentos_mensais").select("company_id").eq("competencia", competencia),
    // Última conferência com a Prefeitura (só Petrópolis hoje — ver
    // ConferirPrefeituraLoteButton) e aprovações da conferência do Simples
    // já dadas pra essa competência.
    buscarExtrasConferencia(supabase, competencia),
    buscarDasPagamentos(supabase, competencia),
    // Mais recente primeiro: vale a última declaração de cada empresa.
    supabase
      .from("integra_contador_pgdas_declaracoes")
      .select("company_id, id_declaracao")
      .eq("competencia", competencia)
      .order("created_at", { ascending: false }),
    carregarDadosSimplesLote(supabase, companyIds),
  ]);
  const fechadasSet = new Set((fechadas ?? []).map((f) => f.company_id));
  const ultimaDeclaracao = new Map<string, string | null>();
  for (const d of (declaracoes.data ?? []) as { company_id: string; id_declaracao: string | null }[]) {
    if (!ultimaDeclaracao.has(d.company_id)) ultimaDeclaracao.set(d.company_id, d.id_declaracao);
  }

  const linhas = await Promise.all(
    (companies ?? []).map(async (company) => {
      const jaEnviado = Boolean(ultimaDeclaracao.get(company.id));

      const prefeitura = extras.prefeitura.get(company.id) ?? null;
      const aprovacao = extras.aprovacoes.get(company.id) ?? null;
      const calculo = await calcularSimplesEmpresa(
        supabase,
        company,
        competencia,
        { prefeitura, aprovacao },
        dadosPorEmpresa.get(company.id),
      );

      return {
        id: company.id,
        nome: company.codigo_cliente
          ? `#${company.codigo_cliente} ${company.trade_name || company.legal_name}`
          : company.trade_name || company.legal_name,
        prefixoArquivo: prefixoArquivoEmpresa(company),
        municipioIbge: company.municipality_ibge_code,
        prefeitura,
        receitaMes: calculo.receitaMes,
        receitaExportacao: calculo.receitaExportacao,
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
        dasPagamento: dasPagamentos.get(company.id) ?? null,
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
