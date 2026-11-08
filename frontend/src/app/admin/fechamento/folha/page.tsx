import { Card } from "@/components/ui/Card";
import { ImportarResumoFolhaForm } from "./ImportarResumoFolhaForm";

export const metadata = { title: "Folha em lote — Painel SOMA" };

export default function ImportarFolhaLotePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Folha de pagamento — todas as empresas</h1>
        <p className="text-sm text-foreground/60">
          Suba o PDF do Resumo da folha do mês (Resumo Geral do sistema de folha, todas as empresas num
          arquivo só) ou o CSV exportado daqui. A empresa é identificada pelo CNPJ. Nada é gravado antes
          de você conferir a prévia e confirmar — a folha gravada alimenta o Fator R de cada empresa.
        </p>
      </div>

      <Card className="p-6">
        <ImportarResumoFolhaForm />
      </Card>
    </div>
  );
}
