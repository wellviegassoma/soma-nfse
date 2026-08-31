import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { ModeloProcedimentoForm } from "@/components/precificacao-modelos/ModeloProcedimentoForm";
import { buscarModeloProcedimento } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Editar procedimento do modelo — Painel SOMA" };

export default async function EditModeloProcedimentoPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/procedimentos/[modeloProcedimentoId]">,
) {
  const { modeloId, modeloProcedimentoId } = await props.params;
  await requireSomaStaff();
  const supabase = await createClient();

  const procedimento = await buscarModeloProcedimento(supabase, modeloProcedimentoId);
  if (!procedimento) notFound();

  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ModeloProcedimentoForm modeloId={modeloId} procedimento={procedimento} />
    </Card>
  );
}
