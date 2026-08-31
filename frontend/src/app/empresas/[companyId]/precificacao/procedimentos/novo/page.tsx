import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { ProcedimentoForm } from "@/components/precificacao/ProcedimentoForm";
import { buscarContextoCalculo, buscarInsumos } from "@/lib/precificacao/queries";

export const metadata = { title: "Novo procedimento" };

export default async function NewProcedimentoPage(
  props: PageProps<"/empresas/[companyId]/precificacao/procedimentos/novo">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/empresas/${companyId}/precificacao`;

  const [contexto, insumosDisponiveis] = await Promise.all([
    buscarContextoCalculo(supabase, companyId),
    buscarInsumos(supabase, companyId),
  ]);

  return (
    <ProcedimentoForm
      companyId={companyId}
      basePath={basePath}
      insumosDisponiveis={insumosDisponiveis}
      custoFixoHora={contexto.custoFixoHora}
      aliquotaImposto={contexto.aliquotaImposto}
      taxaCartao={contexto.taxaCartao}
      descontoPadrao={contexto.descontoPadrao}
      parametrosConfigurados={contexto.parametrosConfigurados}
    />
  );
}
