import { requireSuperAdmin } from "@/lib/auth";
import { buscarContadorResponsavel } from "@/lib/actions/configuracoes";
import { Card } from "@/components/ui/Card";
import { ContadorResponsavelForm } from "./ContadorResponsavelForm";

export const metadata = { title: "Contador responsável — Painel SOMA" };

export default async function ConfiguracoesContadorResponsavelPage() {
  await requireSuperAdmin();
  const contador = await buscarContadorResponsavel();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Contador responsável</h1>
        <p className="text-sm text-foreground/60">
          Dado único, usado em toda declaração do MIT (IRPJ/CSLL/PIS/COFINS) de qualquer empresa
          Lucro Presumido — não é por cliente, é o contador que responde perante a Receita Federal
          pelas apurações da SOMA. Só Super Admin pode editar.
        </p>
      </div>

      <Card className="p-6">
        <ContadorResponsavelForm contador={contador} />
      </Card>
    </div>
  );
}
