import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { SenhaCofreForm } from "./SenhaCofreForm";
import { SenhasCofreList } from "./SenhasCofreList";

export const metadata = { title: "Cofre de senhas — Painel SOMA" };

export default async function AdminCompanyCofreSenhasPage(
  props: PageProps<"/admin/empresas/[companyId]/cofre-senhas">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: senhas } = await supabase
    .from("senhas_cofre")
    .select("id, servico, usuario, observacoes")
    .eq("company_id", companyId)
    .order("servico", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <Alert tone="warning">
        Credenciais reais do cliente. Toda revelação de senha fica registrada em log de auditoria.
      </Alert>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Nova senha</h2>
        <SenhaCofreForm companyId={companyId} />
      </Card>

      {(!senhas || senhas.length === 0) ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma senha cadastrada ainda.
        </Card>
      ) : (
        <SenhasCofreList companyId={companyId} senhas={senhas} />
      )}
    </div>
  );
}
