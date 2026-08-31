import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { InsumoForm } from "@/components/precificacao/InsumoForm";
import { buscarInsumo } from "@/lib/precificacao/queries";

export const metadata = { title: "Editar insumo — Painel SOMA" };

export default async function EditInsumoPage(
  props: PageProps<"/admin/empresas/[companyId]/precificacao/insumos/[insumoId]">,
) {
  const { companyId, insumoId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/admin/empresas/${companyId}/precificacao`;

  const insumo = await buscarInsumo(supabase, insumoId);
  if (!insumo) notFound();

  return (
    <Card className="max-w-xl p-6 sm:p-8">
      <InsumoForm companyId={companyId} basePath={basePath} insumo={insumo} />
    </Card>
  );
}
