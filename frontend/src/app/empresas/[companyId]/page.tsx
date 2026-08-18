import { getCompanyAccess, getCurrentProfileName } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS } from "@/lib/types";

export const metadata = { title: "Painel — SOMA NFS-e" };

export default async function CompanyDashboardPage(
  props: PageProps<"/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const [access, userName] = await Promise.all([
    getCompanyAccess(companyId),
    getCurrentProfileName(),
  ]);

  if (!access) return null; // o layout já redireciona antes de chegar aqui

  const { company, role } = access;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">
          Olá{userName ? `, ${userName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-foreground/60">
          {company.trade_name || company.legal_name} · {ROLE_LABELS[role]}
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">
          Dados da empresa
        </h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-foreground/50">Razão social</dt>
            <dd className="text-sm font-medium text-foreground">
              {company.legal_name}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">Nome fantasia</dt>
            <dd className="text-sm font-medium text-foreground">
              {company.trade_name || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground/50">CNPJ</dt>
            <dd className="text-sm font-medium text-foreground">
              {company.cnpj || "Ainda não cadastrado"}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="border-dashed p-6 text-center">
        <p className="text-sm font-medium text-foreground/70">
          A emissão de NFS-e chega nas próximas fases
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-foreground/50">
          Estamos construindo o cadastro fiscal, os tomadores e o motor de
          emissão. Este painel vai ganhar o botão{" "}
          <span className="font-medium text-foreground/70">+ Emitir Nota</span>{" "}
          em breve.
        </p>
      </Card>
    </div>
  );
}
