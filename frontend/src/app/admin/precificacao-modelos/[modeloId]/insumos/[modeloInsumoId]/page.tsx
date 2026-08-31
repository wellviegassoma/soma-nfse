import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { ModeloInsumoForm } from "@/components/precificacao-modelos/ModeloInsumoForm";
import { buscarModeloInsumo } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Editar insumo do modelo — Painel SOMA" };

export default async function EditModeloInsumoPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/insumos/[modeloInsumoId]">,
) {
  const { modeloId, modeloInsumoId } = await props.params;
  await requireSomaStaff();
  const supabase = await createClient();

  const insumo = await buscarModeloInsumo(supabase, modeloInsumoId);
  if (!insumo) notFound();

  return (
    <Card className="max-w-xl p-6 sm:p-8">
      <ModeloInsumoForm modeloId={modeloId} insumo={insumo} />
    </Card>
  );
}
