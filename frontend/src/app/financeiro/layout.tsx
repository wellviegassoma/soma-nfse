import Link from "next/link";
import { requireUser, getCurrentProfileName } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * Diferente dos layouts de /legalizacao e /extratos, este NÃO chama um
 * require<Modulo>Access() — o Financeiro é o único módulo que o cliente também
 * abre, e o acesso dele é por empresa (ver pode_financeiro() na RLS). Um
 * ADMIN_CLIENTE seria barrado aqui e nunca chegaria na própria empresa.
 *
 * Consequência: cada página de /financeiro é responsável por chamar
 * requireFinanceiroAccess() — sem companyId no painel da SOMA (staff/analista
 * só), com companyId nas telas de empresa. A RLS é a segunda barreira.
 */
export default async function FinanceiroLayout({
  children,
}: LayoutProps<"/financeiro">) {
  await requireUser();
  const userName = await getCurrentProfileName();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">
              Financeiro
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Sair do painel
            </Link>
            {userName && (
              <span className="hidden text-sm text-foreground/60 md:inline">{userName}</span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
