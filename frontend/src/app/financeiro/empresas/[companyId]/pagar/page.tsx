import { requireFinanceiroAccess } from "@/lib/auth";
import { AgendamentosView } from "@/components/financeiro/AgendamentosView";

export const metadata = { title: "Financeiro — Contas a pagar" };

export default async function PagarPage(
  props: PageProps<"/financeiro/empresas/[companyId]/pagar">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);
  return <AgendamentosView companyId={companyId} tipo="PAGAR" />;
}
