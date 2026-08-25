import { Card } from "@/components/ui/Card";
import { ImportFechamentoGlobalForm } from "./ImportFechamentoGlobalForm";

export const metadata = { title: "Importar XML — Painel SOMA" };

export default function ImportarFechamentoGlobalPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Fechamento importado — todas as empresas
        </h1>
        <p className="text-sm text-foreground/60">
          Suba os XMLs de várias empresas de uma vez só — identificamos a empresa de cada nota
          pelo CNPJ do prestador ou do tomador e distribuímos automaticamente para o Fechamento de
          cada uma. Notas cujo CNPJ não bate com nenhuma empresa cadastrada aparecem como erro.
        </p>
      </div>

      <Card className="max-w-2xl p-6 sm:p-8">
        <ImportFechamentoGlobalForm />
      </Card>
    </div>
  );
}
