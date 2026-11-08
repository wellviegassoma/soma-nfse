import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { buscarFaturamentoMensal, somarFaturamento, somarFaturamentoIssRetido } from "@/lib/faturamento";
import { resolverIssMensal } from "@/lib/calculo-impostos";
import { prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";
import { temPermissao } from "@/lib/auth";
import { buscarFechamentosIss } from "@/lib/iss-fechamentos";
import { CentralIssRio, type EmpresaIssRio } from "./CentralIssRio";

export const metadata = { title: "Central ISS Rio — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;
const IBGE_RIO_DE_JANEIRO = "3304557";
const TRINTA_DIAS_MS = 30 * 24 * 3600 * 1000;

function situacaoCertificado(expiresAt: string | null | undefined) {
  const restante = expiresAt ? new Date(expiresAt).getTime() - Date.now() : -1;
  return { valido: restante >= 0, venceEmBreve: restante >= 0 && restante < TRINTA_DIAS_MS };
}

// Conferência mensal do ISS do Rio: faturamento da SOMA × guia do Nota
// Carioca, empresa por empresa (o roteiro feito à mão em 03/11/2026 pra
// competência 10/2026, virado tela). Simples Nacional fica de fora — o
// ISS vai no DAS.
export default async function CentralIssRioPage(props: PageProps<"/admin/fechamento/iss-rio">) {
  const searchParams = await props.searchParams;
  const competenciaParam = typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesAnteriorBrasilia();

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select(
      "id, legal_name, trade_name, codigo_cliente, cnpj, tax_regime, iss_tipo, iss_aliquota_padrao, iss_valor_fixo_profissional, iss_quantidade_profissionais, certificates(expires_at)",
    )
    .eq("municipality_ibge_code", IBGE_RIO_DE_JANEIRO)
    .eq("ativa", true)
    .neq("tax_regime", "SIMPLES_NACIONAL")
    .order("codigo_cliente");

  const [fechamentos, podeMarcarFechamento] = await Promise.all([
    buscarFechamentosIss(supabase, competencia, (companies ?? []).map((c) => c.id)),
    temPermissao("fechamento.executar"),
  ]);

  const empresas: EmpresaIssRio[] = await Promise.all(
    (companies ?? []).map(async (company) => {
      const notas = await buscarFaturamentoMensal(supabase, company.id);
      const receita = somarFaturamento(notas, [competencia]);
      const certificado = Array.isArray(company.certificates) ? company.certificates[0] : company.certificates;
      const situacao = situacaoCertificado(certificado?.expires_at);
      return {
        id: company.id,
        nome: `${company.codigo_cliente ? `${company.codigo_cliente} ` : ""}${company.trade_name || company.legal_name}`,
        prefixoArquivo: prefixoArquivoEmpresa(company),
        issTipo: company.iss_tipo,
        receitaSoma: receita,
        issSoma: resolverIssMensal({
          issTipo: company.iss_tipo,
          aliquotaIss: company.iss_aliquota_padrao,
          valorFixoProfissional: company.iss_valor_fixo_profissional,
          quantidadeProfissionais: company.iss_quantidade_profissionais,
          receitaMes: receita,
          receitaIssRetido: somarFaturamentoIssRetido(notas, [competencia]),
        }),
        certificadoValido: situacao.valido,
        certificadoVenceEmBreve: situacao.venceEmBreve,
        certificadoVenceEm: certificado?.expires_at ?? null,
        fechamento: fechamentos.get(company.id) ?? null,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central ISS Rio</h1>
        <p className="text-sm text-foreground/60">
          Empresas do Rio de Janeiro fora do Simples — faturamento da SOMA × guia do Nota Carioca.{" "}
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

      <CentralIssRio
        key={competencia}
        empresas={empresas}
        competencia={competencia}
        podeMarcarFechamento={podeMarcarFechamento}
      />
    </div>
  );
}
