import { Card } from "@/components/ui/Card";
import { requireSomaStaff } from "@/lib/auth";
import { ModeloForm } from "@/components/precificacao-modelos/ModeloForm";

export const metadata = { title: "Novo modelo — Painel SOMA" };

export default async function NovoModeloPage() {
  await requireSomaStaff();
  return (
    <Card className="max-w-xl p-6 sm:p-8">
      <ModeloForm />
    </Card>
  );
}
