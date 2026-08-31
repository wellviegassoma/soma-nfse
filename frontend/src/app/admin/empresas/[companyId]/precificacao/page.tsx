import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePrecificacaoAccess } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ProcedimentosTable } from "@/components/precificacao/ProcedimentosTable";
import { buscarContextoCalculo, buscarProcedimentosComMargem } from "@/lib/precificacao/queries";

export const metadata = { title: "Precificação — Painel SOMA" };

export default async function AdminPrecificacaoPage(
  props: PageProps<"/admin/empresas/[companyId]/precificacao">,
) {
  const { companyId } = await props.params;
  await requirePrecificacaoAccess(companyId);
  const supabase = await createClient();
  const basePath = `/admin/empresas/${companyId}/precificacao`;

  const [{ parametrosConfigurados }, rows] = await Promise.all([
    buscarContextoCalculo(supabase, companyId),
    buscarProcedimentosComMargem(supabase, companyId),
  ]);

  const emPrejuizo = rows.filter((r) => r.margemPct < 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground/60">
          {rows.length} procedimento(s) cadastrado(s)
          {emPrejuizo > 0 && (
            <span className="ml-2 font-medium text-danger">
              · {emPrejuizo} vendido(s) no prejuízo
            </span>
          )}
        </p>
        <div className="flex gap-2">
          <Link href={`${basePath}/insumos`}>
            <Button variant="secondary">Insumos</Button>
          </Link>
          <Link href={`${basePath}/parametros`}>
            <Button variant="secondary">Parâmetros</Button>
          </Link>
          <Link href={`${basePath}/procedimentos/novo`}>
            <Button>+ Novo procedimento</Button>
          </Link>
        </div>
      </div>

      {!parametrosConfigurados && (
        <Alert tone="warning">
          Os parâmetros de custo fixo (carga horária, imposto, taxa de cartão) ainda não foram
          configurados —{" "}
          <Link href={`${basePath}/parametros`} className="underline">
            configure aqui
          </Link>{" "}
          antes de confiar nas margens abaixo.
        </Alert>
      )}

      <ProcedimentosTable basePath={basePath} rows={rows} />
    </div>
  );
}
