import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Integra Contador — Painel SOMA" };

export default async function AdminCompanyIntegraContadorPage(
  props: PageProps<"/admin/empresas/[companyId]/integra-contador">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Situação fiscal</h2>
        <p className="mb-4 text-sm text-foreground/50">
          Emite o relatório de Situação Fiscal do contribuinte direto na Receita Federal
          (Integra Contador / Serpro). A primeira consulta do dia pode levar até um minuto;
          consultas seguintes no mesmo dia vêm do cache e voltam na hora.
        </p>

        {!company?.cnpj ? (
          <Alert tone="warning">
            Essa empresa não tem CNPJ cadastrado — essa consulta só funciona pra CNPJ.
          </Alert>
        ) : (
          <a href={`/admin/empresas/${companyId}/integra-contador/situacao-fiscal`} target="_blank">
            <Button>Consultar situação fiscal</Button>
          </a>
        )}
      </Card>
    </div>
  );
}
