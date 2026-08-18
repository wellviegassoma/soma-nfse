import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserCompanies } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/LogoutButton";
import { ROLE_LABELS } from "@/lib/types";

export const metadata = { title: "Escolha a empresa — SOMA NFS-e" };

export default async function EmpresasPage() {
  const companies = await getUserCompanies();

  if (companies.length === 0) redirect("/");
  if (companies.length === 1) redirect(`/empresas/${companies[0].company_id}`);

  return (
    <main className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <div className="mb-8">
          <Logo />
        </div>

        <h1 className="mb-1 text-lg font-semibold text-foreground">
          Escolha a empresa
        </h1>
        <p className="mb-8 text-sm text-foreground/60">
          Sua conta tem acesso a mais de uma empresa.
        </p>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {companies.map(({ company, role }) => (
            <Link key={company.id} href={`/empresas/${company.id}`}>
              <Card className="flex h-full flex-col gap-1 p-5 transition-shadow hover:shadow-md">
                <span className="text-[15px] font-semibold text-foreground">
                  {company.trade_name || company.legal_name}
                </span>
                {company.trade_name && (
                  <span className="text-xs text-foreground/50">
                    {company.legal_name}
                  </span>
                )}
                <span className="mt-2 inline-flex w-fit rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                  {ROLE_LABELS[role]}
                </span>
              </Card>
            </Link>
          ))}
        </div>

        <LogoutButton className="mt-8" />
      </div>
    </main>
  );
}
