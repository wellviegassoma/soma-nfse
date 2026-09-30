import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TomadorForm } from "@/app/empresas/[companyId]/tomadores/TomadorForm";
import type { Customer } from "@/lib/types";

export const metadata = { title: "Editar tomador — Painel SOMA" };

// Espelha /empresas/[companyId]/tomadores/[customerId] — necessário porque
// aquela rota fica sob o layout de /empresas/[companyId], que exige uma
// linha em user_companies (acesso de cliente) e manda a equipe SOMA sem
// isso pra /admin/empresas, mesmo quem já tem notas.emitir por
// usuario_permissoes. Sem esta página, a equipe conseguia emitir nota mas
// não conseguia corrigir o cadastro de um tomador já existente.
export default async function AdminEditarTomadorPage(
  props: PageProps<"/admin/emissao-notas/[companyId]/tomadores/[customerId]">,
) {
  const { companyId, customerId } = await props.params;
  await requirePermissao("notas.emitir", companyId);

  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select(
      "id, company_id, type, cpf_cnpj, name, email, zip_code, address, number, complement, district, city, state",
    )
    .eq("id", customerId)
    .eq("company_id", companyId)
    .single();

  if (!customer) notFound();

  const basePath = `/admin/emissao-notas/${companyId}`;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Editar tomador</h1>
      <Card className="max-w-lg p-6 sm:p-8">
        <TomadorForm
          companyId={companyId}
          customer={customer as Customer}
          redirectTo={basePath}
          cancelHref={basePath}
        />
      </Card>
    </div>
  );
}
