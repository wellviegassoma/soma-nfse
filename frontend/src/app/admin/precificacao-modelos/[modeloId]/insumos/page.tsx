import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ModeloInsumosTable } from "@/components/precificacao-modelos/ModeloInsumosTable";
import { buscarModelo, buscarModeloInsumos } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Insumos do modelo — Painel SOMA" };

export default async function ModeloInsumosPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/insumos">,
) {
  const { modeloId } = await props.params;
  await requireSomaStaff();
  const supabase = await createClient();

  const [modelo, insumos] = await Promise.all([
    buscarModelo(supabase, modeloId),
    buscarModeloInsumos(supabase, modeloId),
  ]);
  if (!modelo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/admin/precificacao-modelos/${modeloId}`} className="text-sm text-foreground/60 hover:underline">
          ← {modelo.nome}
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">{insumos.length} insumo(s) cadastrado(s)</p>
        <Link href={`/admin/precificacao-modelos/${modeloId}/insumos/novo`}>
          <Button>+ Novo insumo</Button>
        </Link>
      </div>
      <ModeloInsumosTable modeloId={modeloId} insumos={insumos} />
    </div>
  );
}
