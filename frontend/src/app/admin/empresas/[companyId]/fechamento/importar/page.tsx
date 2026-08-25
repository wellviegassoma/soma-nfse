import { Card } from "@/components/ui/Card";
import { ImportFechamentoForm } from "./ImportFechamentoForm";

export const metadata = { title: "Importar XML — Painel SOMA" };

export default async function ImportarFechamentoPage(
  props: PageProps<"/admin/empresas/[companyId]/fechamento/importar">,
) {
  const { companyId } = await props.params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fechamento importado</h1>
        <p className="text-sm text-foreground/60">
          Suba manualmente os XMLs das notas já baixadas por fora (ex.: pela sua aplicação Python)
          — eles entram no mesmo relatório, na visão geral e nos tops junto com o que a
          sincronização automática já traz.
        </p>
      </div>

      <Card className="max-w-2xl p-6 sm:p-8">
        <ImportFechamentoForm companyId={companyId} />
      </Card>
    </div>
  );
}
