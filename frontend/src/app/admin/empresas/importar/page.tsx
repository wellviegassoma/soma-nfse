import { Card } from "@/components/ui/Card";
import { ImportCompaniesForm } from "./ImportCompaniesForm";

export const metadata = { title: "Importar empresas — Painel SOMA" };
export const maxDuration = 300;

export default function ImportarEmpresasPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Importar empresas</h1>
        <p className="text-sm text-foreground/60">
          Suba uma planilha (.xlsx ou .csv) com uma coluna de nome e uma coluna de CNPJ (Pessoa
          Jurídica) ou CPF (Pessoa Física) — cada linha usa uma ou outra, nunca as duas. Pra CNPJ,
          buscamos razão social, nome fantasia, CNAE e demais dados automaticamente na Receita
          Federal. Pra CPF não há busca automática (sem API pública, por sigilo) — a coluna de
          nome é obrigatória nesse caso.
        </p>
      </div>

      <Card className="max-w-2xl p-6 sm:p-8">
        <ImportCompaniesForm />
      </Card>
    </div>
  );
}
