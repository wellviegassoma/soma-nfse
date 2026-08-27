import Link from "next/link";
import { requireExtratosAccess, getCurrentProfileName } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";

export default async function ExtratosLayout({
  children,
}: LayoutProps<"/extratos">) {
  await requireExtratosAccess();
  const userName = await getCurrentProfileName();

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">
              Extratos
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
