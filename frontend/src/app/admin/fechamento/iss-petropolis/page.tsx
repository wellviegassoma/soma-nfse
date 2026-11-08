import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { temPermissao } from "@/lib/auth";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { buscarFaturamentoMensal, somarFaturamento, somarFaturamentoIssRetido } from "@/lib/faturamento";
import { resolverIssMensal } from "@/lib/calculo-impostos";
import { prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";
import { buscarFechamentosIss } from "@/lib/iss-fechamentos";
import { IBGE_PETROPOLIS } from "@/lib/iss-petropolis";
import { CentralIssPetropolis, type EmpresaIssPetropolis } from "./CentralIssPetropolis";

export const metadata = { title: "Central ISS Petrópolis — Painel SOMA" };

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

// Conferência mensal do ISS de Petrópolis, no mesmo formato da Central ISS
// Rio: faturamento da SOMA (normal + retido) × o que a Prefeitura tem
// lançado no mês, e emissão da guia (consolida o movimento — ação real)
// das que batem. Simples Nacional fica de fora — o ISS vai no DAS.
export default async function CentralIssPetropolisPage(props: PageProps<"/admin/fechamento/iss-petropolis">) {
  const searchParams = await props.searchParams;
  const competenciaParam = typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam) ? competenciaParam : mesAnteriorBrasilia();

  const supabase = await createClient();
  const [{ data: companies }, { data: credenciais }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trade_name, codigo_cliente, cnpj, iss_tipo, iss_aliquota_padrao, iss_valor_fixo_profissional, iss_quantidade_profissionais, petropolis_cmc",
      )
      .eq("municipality_ibge_code", IBGE_PETROPOLIS)
      .eq("ativa", true)
      .neq("tax_regime", "SIMPLES_NACIONAL")
      .order("codigo_cliente"),
    supabase.from("petropolis_credenciais").select("company_id"),
  ]);
  const comLogin = new Set((credenciais ?? []).map((c) => c.company_id as string));

  const [fechamentos, podeMarcarFechamento, podeEmitir] = await Promise.all([
    buscarFechamentosIss(supabase, competencia, (companies ?? []).map((c) => c.id)),
    temPermissao("fechamento.executar"),
    temPermissao("impostos.emitir_iss"),
  ]);

  const empresas: EmpresaIssPetropolis[] = await Promise.all(
    (companies ?? []).map(async (company) => {
      const notas = await buscarFaturamentoMensal(supabase, company.id);
      const receita = somarFaturamento(notas, [competencia]);
      const retido = somarFaturamentoIssRetido(notas, [competencia]);
      return {
        id: company.id,
        nome: `${company.codigo_cliente ? `${company.codigo_cliente} ` : ""}${company.trade_name || company.legal_name}`,
        prefixoArquivo: prefixoArquivoEmpresa(company),
        receitaSoma: receita,
        receitaRetidaSoma: retido,
        issSoma: resolverIssMensal({
          issTipo: company.iss_tipo,
          aliquotaIss: company.iss_aliquota_padrao,
          valorFixoProfissional: company.iss_valor_fixo_profissional,
          quantidadeProfissionais: company.iss_quantidade_profissionais,
          receitaMes: receita,
          receitaIssRetido: retido,
        }),
        temAcesso: !!company.petropolis_cmc || comLogin.has(company.id),
        fechamento: fechamentos.get(company.id) ?? null,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central ISS Petrópolis</h1>
        <p className="text-sm text-foreground/60">
          Empresas de Petrópolis fora do Simples — faturamento da SOMA × movimento lançado na Prefeitura.{" "}
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

      <CentralIssPetropolis
        key={competencia}
        empresas={empresas}
        competencia={competencia}
        podeMarcarFechamento={podeMarcarFechamento}
        podeEmitir={podeEmitir}
      />
    </div>
  );
}
