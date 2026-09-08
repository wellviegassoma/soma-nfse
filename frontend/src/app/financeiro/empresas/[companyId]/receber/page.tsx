import { requireFinanceiroAccess } from "@/lib/auth";
import { AgendamentosView } from "@/components/financeiro/AgendamentosView";

export const metadata = { title: "Financeiro — Contas a receber" };

export default async function ReceberPage(
  props: PageProps<"/financeiro/empresas/[companyId]/receber">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);
  return <AgendamentosView companyId={companyId} tipo="RECEBER" />;
}
