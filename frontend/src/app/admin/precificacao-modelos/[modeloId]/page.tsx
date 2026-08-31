import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ModeloForm } from "@/components/precificacao-modelos/ModeloForm";
import { DeleteModeloButton } from "@/components/precificacao-modelos/DeleteModeloButton";
import { buscarModelo, buscarModeloInsumos, buscarModeloProcedimentos } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Editar modelo — Painel SOMA" };

export default async function EditModeloPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]">,
) {
  const { modeloId } = await props.params;
  await requireSomaStaff();
  const supabase = await createClient();

  const [modelo, insumos, procedimentos] = await Promise.all([
    buscarModelo(supabase, modeloId),
    buscarModeloInsumos(supabase, modeloId),
    buscarModeloProcedimentos(supabase, modeloId),
  ]);
  if (!modelo) notFound();

  return (
    <div className="flex flex-col gap-8">
      <Card className="max-w-xl p-6 sm:p-8">
        <h2 className="mb-5 text-sm font-semibold text-foreground/70">Dados do modelo</h2>
        <ModeloForm modelo={modelo} />
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-semibold text-foreground">Insumos</div>
            <div className="text-xs text-foreground/50">{insumos.length} cadastrado(s)</div>
          </div>
          <Link href={`/admin/precificacao-modelos/${modeloId}/insumos`}>
            <Button variant="secondary">Gerenciar</Button>
          </Link>
        </Card>
        <Card className="flex items-center justify-between p-5">
          <div>
            <div className="text-sm font-semibold text-foreground">Procedimentos</div>
            <div className="text-xs text-foreground/50">{procedimentos.length} cadastrado(s)</div>
          </div>
          <Link href={`/admin/precificacao-modelos/${modeloId}/procedimentos`}>
            <Button variant="secondary">Gerenciar</Button>
          </Link>
        </Card>
      </div>

      <div className="border-t border-border pt-5">
        <DeleteModeloButton modeloId={modeloId} />
      </div>
    </div>
  );
}
