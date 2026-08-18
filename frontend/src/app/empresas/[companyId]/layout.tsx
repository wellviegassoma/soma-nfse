import { redirect } from "next/navigation";
import {
  getCompanyAccess,
  getUserCompanies,
  getCurrentProfileName,
} from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";

export default async function CompanyLayout(
  props: LayoutProps<"/empresas/[companyId]">,
) {
  const { companyId } = await props.params;

  const [access, companies, userName] = await Promise.all([
    getCompanyAccess(companyId),
    getUserCompanies(),
    getCurrentProfileName(),
  ]);

  // RLS já impede vazamento entre empresas — aqui só decidimos a navegação.
  if (!access) redirect("/empresas");

  const isSomaStaff = companies.some(
    (c) => c.role === "SUPER_ADMIN" || c.role === "ADMIN_SOMA",
  );

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader
        company={access.company}
        role={access.role}
        hasMultipleCompanies={companies.length > 1}
        isSomaStaff={isSomaStaff}
        userName={userName}
      />
      <div className="mx-auto max-w-5xl px-4 py-8">{props.children}</div>
    </div>
  );
}
