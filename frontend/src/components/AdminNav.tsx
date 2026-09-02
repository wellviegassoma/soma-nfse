"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; exact?: boolean };

const TABS: Tab[] = [
  { href: "/admin", label: "Visão geral", exact: true },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/certificados", label: "Certificados" },
  { href: "/admin/precificacao-modelos", label: "Modelos de Precificação" },
  { href: "/admin/fechamento", label: "Fechamento" },
  { href: "/admin/erros", label: "Erros" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/chat", label: "Chat IA" },
];

const TAB_SUPER_ADMIN: Tab = { href: "/admin/configuracoes/contador-responsavel", label: "Configurações" };

// `isSuperAdmin` vem do layout (server component) — a aba só some da UI
// pra quem não é Super Admin; a página em si também é protegida por
// requireSuperAdmin(), então isso aqui é só uma questão de não poluir a
// navegação de quem não pode usar, não a proteção de verdade.
export function AdminNav({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isSuperAdmin ? [...TABS, TAB_SUPER_ADMIN] : TABS;

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
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
