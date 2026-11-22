"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const ITENS = [
  { href: "/admin/configuracoes/contador-responsavel", label: "Contador responsável" },
  { href: "/admin/configuracoes/agenda-metas", label: "Metas da agenda tributária" },
];

export function ConfiguracoesNav() {
  const pathname = usePathname();
  return (
    <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg border border-border bg-surface p-1 text-sm">
      {ITENS.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          className={cn(
            "rounded-md px-3 py-1.5",
            pathname.startsWith(i.href) ? "bg-brand text-brand-foreground" : "text-foreground/70 hover:bg-surface-muted",
          )}
        >
          {i.label}
        </Link>
      ))}
    </div>
  );
}
