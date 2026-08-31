import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { ProcedimentoForm } from "@/components/precificacao/ProcedimentoForm";
import { DeleteProcedimentoButton } from "@/components/precificacao/DeleteProcedimentoButton";
import { buscarContextoCalculo, buscarInsumos, buscarProcedimentoComReceita } from "@/lib/precificacao/queries";

export const metadata = { title: "Editar procedimento" };

export default async function EditProcedimentoPage(
  props: PageProps<"/empresas/[companyId]/precificacao/procedimentos/[procedimentoId]">,
) {
  const { companyId, procedimentoId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/empresas/${companyId}/precificacao`;

  const [procedimento, contexto, insumosDisponiveis] = await Promise.all([
    buscarProcedimentoComReceita(supabase, procedimentoId),
    buscarContextoCalculo(supabase, companyId),
    buscarInsumos(supabase, companyId),
  ]);
  if (!procedimento) notFound();

  return (
    <div className="flex flex-col gap-6">
      <ProcedimentoForm
        companyId={companyId}
        basePath={basePath}
        procedimento={procedimento}
        insumosDisponiveis={insumosDisponiveis}
        custoFixoHora={contexto.custoFixoHora}
        aliquotaImposto={contexto.aliquotaImposto}
        taxaCartao={contexto.taxaCartao}
        descontoPadrao={contexto.descontoPadrao}
        parametrosConfigurados={contexto.parametrosConfigurados}
      />
      <div className="border-t border-border pt-5">
        <DeleteProcedimentoButton companyId={companyId} procedimentoId={procedimento.id} basePath={basePath} />
      </div>
    </div>
  );
}
