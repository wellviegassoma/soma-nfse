"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITENS = [
  { href: "/admin/tarefas", label: "Minhas tarefas", exato: true },
  { href: "/admin/tarefas/painel", label: "Painel geral" },
  { href: "/admin/tarefas/empresas", label: "Por empresa" },
];

export function TarefasNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
      {ITENS.map((i) => {
        const ativo = i.exato ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn("rounded-md px-3 py-1.5", ativo ? "bg-brand text-brand-foreground" : "text-foreground/70 hover:bg-surface-muted")}
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
