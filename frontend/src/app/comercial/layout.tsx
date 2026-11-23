import Link from "next/link";
import { requireComercialAccess, getCurrentProfileName, isSomaStaff, temPermissao } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

// Comercial tem área própria (mesmo padrão de /legalizacao e /extratos):
// quem só tem comercial.ver entra aqui sem precisar de acesso às empresas
// (empresas.ver), que é o que libera o /admin inteiro.
export default async function ComercialLayout({ children }: LayoutProps<"/comercial">) {
  await requireComercialAccess();
  const userName = await getCurrentProfileName();
  const staff = await isSomaStaff();
  const irpf = await temPermissao("irpf.ver");

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Link href="/comercial">
              <Logo />
            </Link>
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">Comercial</span>
          </div>
          <div className="flex items-center gap-2">
            {staff && (
              <Link
                href="/admin"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
              >
                Painel de Administração
              </Link>
            )}
            {irpf && (
              <Link href="/irpf" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block">
                IRPF
              </Link>
            )}
            {userName && <span className="hidden text-sm text-foreground/60 md:inline">{userName}</span>}
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-8">{children}</div>
    </div>
  );
}
