import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ModeloProcedimentosTable } from "@/components/precificacao-modelos/ModeloProcedimentosTable";
import { buscarModelo, buscarModeloProcedimentos } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Procedimentos do modelo — Painel SOMA" };

export default async function ModeloProcedimentosPage(
  props: PageProps<"/admin/precificacao-modelos/[modeloId]/procedimentos">,
) {
  const { modeloId } = await props.params;
  await requireSomaStaff();
  const supabase = await createClient();

  const [modelo, procedimentos] = await Promise.all([
    buscarModelo(supabase, modeloId),
    buscarModeloProcedimentos(supabase, modeloId),
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
        <p className="text-sm text-foreground/60">{procedimentos.length} procedimento(s) cadastrado(s)</p>
        <Link href={`/admin/precificacao-modelos/${modeloId}/procedimentos/novo`}>
          <Button>+ Novo procedimento</Button>
        </Link>
      </div>
      <ModeloProcedimentosTable modeloId={modeloId} procedimentos={procedimentos} />
    </div>
  );
}
