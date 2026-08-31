import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { InsumosTable } from "@/components/precificacao/InsumosTable";
import { buscarInsumos } from "@/lib/precificacao/queries";

export const metadata = { title: "Insumos — Painel SOMA" };

export default async function AdminPrecificacaoInsumosPage(
  props: PageProps<"/admin/empresas/[companyId]/precificacao/insumos">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/admin/empresas/${companyId}/precificacao`;

  const insumos = await buscarInsumos(supabase, companyId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">{insumos.length} insumo(s) cadastrado(s)</p>
        <Link href={`${basePath}/insumos/novo`}>
          <Button>+ Novo insumo</Button>
        </Link>
      </div>
      <InsumosTable companyId={companyId} basePath={basePath} insumos={insumos} />
    </div>
  );
}
