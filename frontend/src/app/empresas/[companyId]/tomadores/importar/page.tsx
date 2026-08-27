import { Card } from "@/components/ui/Card";
import { ImportTomadoresForm } from "./ImportTomadoresForm";

export const metadata = { title: "Importar tomadores — SOMA Gestão" };

export default async function ImportarTomadoresPage(
  props: PageProps<"/empresas/[companyId]/tomadores/importar">,
) {
  const { companyId } = await props.params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importar tomadores</h1>
        <p className="text-sm text-foreground/60">
          A partir dos XMLs de notas já emitidas (por esse ou outro sistema).
        </p>
      </div>

      <Card className="max-w-2xl p-6 sm:p-8">
        <ImportTomadoresForm companyId={companyId} />
      </Card>
    </div>
  );
}
