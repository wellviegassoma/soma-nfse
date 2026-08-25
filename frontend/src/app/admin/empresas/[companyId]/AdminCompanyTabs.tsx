"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "dados-fiscais", label: "Dados fiscais" },
  { href: "certificado", label: "Certificado" },
  { href: "servicos", label: "Serviços" },
  { href: "usuarios", label: "Usuários" },
  { href: "fechamento", label: "Fechamento" },
];

export function AdminCompanyTabs({ companyId }: { companyId: string }) {
  const pathname = usePathname();
  const base = `/admin/empresas/${companyId}`;

  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const href = `${base}/${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
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
