import { redirect } from "next/navigation";
import { requireUser, getUserCompanies } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { LogoutButton } from "@/components/LogoutButton";

export default async function HomePage() {
  await requireUser();
  const companies = await getUserCompanies();

  // Papel decide o destino antes de olhar quantas empresas o usuário tem —
  // staff e analistas de módulo têm um vínculo incidental (só pra existir
  // uma linha em user_companies), que não deve mandar pro fluxo de cliente.
  if (companies.some((c) => c.role === "SUPER_ADMIN" || c.role === "ADMIN_SOMA")) {
    redirect("/admin");
  }
  if (companies.some((c) => c.role === "ANALISTA_LEGALIZACAO")) {
    redirect("/legalizacao");
  }
  if (companies.some((c) => c.role === "ANALISTA_CONTABIL")) {
    redirect("/extratos");
  }

  if (companies.length === 1) {
    redirect(`/empresas/${companies[0].company_id}`);
  }

  if (companies.length > 1) {
    redirect("/empresas");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 text-center sm:p-8">
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            Sem acesso a nenhuma empresa
          </h1>
          <p className="mb-6 text-sm text-foreground/60">
            Sua conta ainda não foi vinculada a nenhuma empresa. Entre em
            contato com a SOMA Contabilidade.
          </p>
          <LogoutButton />
        </Card>
      </div>
    </main>
  );
}
