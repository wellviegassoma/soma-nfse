"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function CompanyTabs({
  companyId,
  mostrarFinanceiro = false,
}: {
  companyId: string;
  // Financeiro fica fora pra EMISSOR (recepção de clínica) — quem decide é o
  // layout, que conhece o papel. Mesmo critério de pode_financeiro() na RLS.
  mostrarFinanceiro?: boolean;
}) {
  const pathname = usePathname();
  const base = `/empresas/${companyId}`;
  const tabs = [
    { href: base, label: "Visão geral" },
    { href: `${base}/notas`, label: "Notas" },
    { href: `${base}/tomadores`, label: "Tomadores" },
    { href: `${base}/precificacao`, label: "Precificação" },
    ...(mostrarFinanceiro
      ? [{ href: `/financeiro/empresas/${companyId}`, label: "Financeiro" }]
      : []),
  ];

  return (
    <nav className="mb-6 flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active =
          tab.href === base ? pathname === base : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-foreground/55 hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
