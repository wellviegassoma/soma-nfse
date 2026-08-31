import { Card } from "@/components/ui/Card";
import { requireSomaStaff } from "@/lib/auth";
import { ModeloProcedimentoForm } from "@/components/precificacao-modelos/ModeloProcedimentoForm";

export const metadata = { title: "Novo procedimento do modelo — Painel SOMA" };

export default async function NovoModeloProcedimentoPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/procedimentos/novo">,
) {
  const { modeloId } = await props.params;
  await requireSomaStaff();

  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      <ModeloProcedimentoForm modeloId={modeloId} />
    </Card>
  );
}
