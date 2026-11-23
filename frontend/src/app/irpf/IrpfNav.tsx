"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/irpf", label: "Painel", exact: true },
  { href: "/irpf/declaracoes", label: "Declarações" },
  { href: "/irpf/contribuintes", label: "Contribuintes" },
  { href: "/irpf/financeiro", label: "Financeiro" },
  { href: "/irpf/importar", label: "Importar .DEC" },
];

export function IrpfNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-1 border-b border-border">
      {TABS.map((t) => {
        const ativo = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              ativo ? "border-brand text-brand" : "border-transparent text-foreground/55 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
