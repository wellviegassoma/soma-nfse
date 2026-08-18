import { redirect } from "next/navigation";

export default async function AdminCompanyIndexPage(
  props: PageProps<"/admin/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  redirect(`/admin/empresas/${companyId}/dados-fiscais`);
}
