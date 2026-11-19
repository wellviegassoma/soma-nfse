import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarBasesReforma, CUSTOS_CREDITAVEIS_PADRAO, B2B_PADRAO } from "@/lib/reforma-tributaria/dados";
import { NOMES_CCLASSTRIB } from "@/lib/ibscbs-correlacao";
import { TAX_REGIME_LABELS } from "@/lib/types";
import { SimuladorEmpresa } from "./SimuladorEmpresa";

export const metadata = { title: "Simulador da Reforma — Painel SOMA" };

function lerPercentual(v: string | string[] | undefined, padrao: number) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : padrao;
}

export default async function SimuladorEmpresaPage(props: PageProps<"/admin/reforma-tributaria/[companyId]">) {
  const { companyId } = await props.params;
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [base] = await carregarBasesReforma(supabase, {
    companyId,
    custosCreditaveisPct: lerPercentual(sp.custos, CUSTOS_CREDITAVEIS_PADRAO),
    percentualB2b: lerPercentual(sp.b2b, B2B_PADRAO),
  });
  if (!base) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/reforma-tributaria" className="text-sm text-brand hover:underline">
          ← Carteira
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-foreground">
          {base.codigoCliente ? <span className="text-foreground/45">#{base.codigoCliente} </span> : null}
          {base.nome}
        </h1>
        <p className="text-sm text-foreground/60">
          Regime cadastrado: {base.taxRegime ? TAX_REGIME_LABELS[base.taxRegime] : "não informado"}
          {base.cClassTrib
            ? ` · serviço principal ${base.cClassTrib} — ${NOMES_CCLASSTRIB[base.cClassTrib] ?? "classificação sem nome"}`
            : " · serviços sem cClassTrib cadastrado"}
          {base.receitaEstimada ? ` · receita projetada de ${base.mesesReceita} mês(es)` : ""}
        </p>
        <p className="text-xs text-foreground/50">
          Anexo do Simples:{" "}
          {base.origemAnexo === "cadastro"
            ? "Fator R conforme o cadastro da empresa"
            : base.origemAnexo === "servicos"
              ? "pela atividade dos serviços cadastrados"
              : "sem atividade do Simples nos serviços — assumido sujeito ao Fator R (conservador); ajuste abaixo se não for"}
        </p>
      </div>
      <SimuladorEmpresa
        taxRegime={base.taxRegime}
        inicial={base.entrada}
        folhaInformada={base.folhaInformada}
      />
    </div>
  );
}
