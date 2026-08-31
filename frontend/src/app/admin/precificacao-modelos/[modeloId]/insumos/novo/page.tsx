import { Card } from "@/components/ui/Card";
import { requireSomaStaff } from "@/lib/auth";
import { ModeloInsumoForm } from "@/components/precificacao-modelos/ModeloInsumoForm";

export const metadata = { title: "Novo insumo do modelo — Painel SOMA" };

export default async function NovoModeloInsumoPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/insumos/novo">,
) {
  const { modeloId } = await props.params;
  await requireSomaStaff();

  return (
    <Card className="max-w-xl p-6 sm:p-8">
      <ModeloInsumoForm modeloId={modeloId} />
    </Card>
  );
}
