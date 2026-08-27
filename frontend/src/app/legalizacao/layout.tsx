import Link from "next/link";
import { requireLegalizacaoAccess, getCurrentProfileName } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { LegalizacaoNav } from "@/components/LegalizacaoNav";

export default async function LegalizacaoLayout({
  children,
}: LayoutProps<"/legalizacao">) {
  await requireLegalizacaoAccess();
  const userName = await getCurrentProfileName();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">
              Legalização
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
      <div className="mx-auto max-w-5xl px-4 py-8">
        <LegalizacaoNav />
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
