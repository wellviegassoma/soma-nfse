import { redirect } from "next/navigation";
import {
  getCompanyAccess,
  getUserCompanies,
  getCurrentProfileName,
  isSomaStaff as checkIsSomaStaff,
} from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { CompanyTabs } from "@/components/CompanyTabs";

function rotuloAcesso(isSomaStaff: boolean, permissoes: string[]): string {
  if (isSomaStaff) return "Equipe SOMA";
  if (permissoes.includes("usuarios_empresa.gerenciar")) return "Administrador";
  if (permissoes.includes("notas.emitir")) return "Emissor";
  return "Usuário";
}

export default async function CompanyLayout(
  props: LayoutProps<"/empresas/[companyId]">,
) {
  const { companyId } = await props.params;

  const [access, companies, userName, isSomaStaff] = await Promise.all([
    getCompanyAccess(companyId),
    getUserCompanies(),
    getCurrentProfileName(),
    checkIsSomaStaff(),
  ]);

  // RLS já impede vazamento entre empresas — aqui só decidimos a navegação.
  // access só existe se houver ALGUMA permissão escopada a essa empresa
  // (getUserCompanies só retorna linhas com company_id preenchido), então
  // staff sem nenhuma permissão de empresa cai aqui mesmo sendo staff —
  // por isso a checagem seguinte usa isSomaStaff em separado.
  if (!access && !isSomaStaff) redirect("/empresas");
  if (!access && isSomaStaff) redirect("/admin/empresas");

  return (
    <div className="min-h-dvh bg-background">
      <AppHeader
        company={access!.company}
        roleLabel={rotuloAcesso(isSomaStaff, access!.permissoes)}
        hasMultipleCompanies={companies.length > 1}
        isSomaStaff={isSomaStaff}
        userName={userName}
      />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <CompanyTabs
          companyId={companyId}
          mostrarFinanceiro={isSomaStaff || access!.permissoes.includes("financeiro.ver")}
          mostrarUsuarios={access!.permissoes.includes("usuarios_empresa.gerenciar")}
        />
        {props.children}
      </div>
    </div>
  );
}
