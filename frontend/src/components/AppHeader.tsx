import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { ROLE_LABELS, type Company, type UserRole } from "@/lib/types";

export function AppHeader({
  company,
  role,
  hasMultipleCompanies,
  isSomaStaff,
  userName,
}: {
  company: Company;
  role: UserRole;
  hasMultipleCompanies: boolean;
  isSomaStaff: boolean;
  userName: string | null;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
        <div className="flex min-w-0 items-center gap-4">
          <Logo />
          <div className="hidden h-8 w-px bg-border sm:block" />
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-sm font-semibold text-foreground">
              {company.trade_name || company.legal_name}
            </div>
            <div className="text-xs text-foreground/50">{ROLE_LABELS[role]}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isSomaStaff && (
            <Link
              href="/admin/empresas"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Painel SOMA
            </Link>
          )}
          {hasMultipleCompanies && (
            <Link
              href="/empresas"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Trocar empresa
            </Link>
          )}
          {userName && (
            <span className="hidden text-sm text-foreground/60 md:inline">
              {userName}
            </span>
          )}
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
