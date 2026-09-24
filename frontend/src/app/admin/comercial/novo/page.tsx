import { requirePermissao } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { NovoProspectForm } from "./NovoProspectForm";

export const metadata = { title: "Novo prospect — Comercial" };

export default async function NovoProspectPage() {
  await requirePermissao("comercial.editar");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Novo prospect</h1>
      <Card className="max-w-lg p-6 sm:p-8">
        <NovoProspectForm />
      </Card>
    </div>
  );
}
