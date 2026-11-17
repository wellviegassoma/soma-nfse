"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { contarPedidosPendentes } from "@/lib/actions/pedidos-nota";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; exact?: boolean };

const TABS: Tab[] = [
  { href: "/admin", label: "Visão geral", exact: true },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/certificados", label: "Certificados" },
  { href: "/admin/precificacao-modelos", label: "Modelos de Precificação" },
  { href: "/admin/fechamento", label: "Fechamento" },
  { href: "/admin/automacao", label: "Automação" },
  { href: "/admin/erros", label: "Erros" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/chat", label: "Chat IA" },
];

const TAB_EMISSAO_NOTAS: Tab = { href: "/admin/emissao-notas", label: "Emissão de Notas" };
// Pedidos sinalizados com #nota no Digisac (docs/pedido-nota-ia.md).
const TAB_PEDIDOS_NOTA: Tab = { href: "/admin/pedidos-nota", label: "Pedidos de Nota" };
const TAB_COMERCIAL: Tab = { href: "/admin/comercial", label: "Comercial" };
const TAB_USUARIOS: Tab = { href: "/admin/usuarios", label: "Usuários" };
const TAB_SUPER_ADMIN: Tab = { href: "/admin/configuracoes/contador-responsavel", label: "Configurações" };

// Selo de pendências da aba Pedidos de Nota: começa com o número que o layout
// (server) contou e atualiza a cada minuto, ao voltar para a aba do navegador
// e ao trocar de página — pedido novo chega pelo webhook do Digisac a
// qualquer momento, sem ninguém recarregar.
function usePedidosPendentes(ativo: boolean, inicial: number, pathname: string) {
  const [n, setN] = useState(inicial);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const atualizar = () =>
      contarPedidosPendentes()
        .then((v) => {
          if (vivo) setN(v);
        })
        .catch(() => {});
    atualizar();
    const id = setInterval(atualizar, 60_000);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      vivo = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo, pathname]);
  return n;
}

// `isSuperAdmin`/`podeGerenciarUsuarios`/`podeEmitirNotas`/`podeVerComercial`
// vêm do layout (server component) — a aba só some da UI pra quem não pode
// usar; a página em si também é protegida (requireSuperAdmin /
// usuarios.gerenciar_equipe|clientes / notas.emitir / comercial.ver), então
// isso aqui é só uma questão de não poluir a navegação, não a proteção de
// verdade.
export function AdminNav({
  isSuperAdmin,
  podeGerenciarUsuarios,
  podeEmitirNotas,
  podeVerComercial,
  pedidosPendentes = 0,
}: {
  isSuperAdmin: boolean;
  podeGerenciarUsuarios: boolean;
  podeEmitirNotas: boolean;
  podeVerComercial: boolean;
  pedidosPendentes?: number;
}) {
  const pathname = usePathname();
  const pendentes = usePedidosPendentes(podeEmitirNotas, pedidosPendentes, pathname);
  const tabs = [
    ...TABS,
    ...(podeEmitirNotas ? [TAB_EMISSAO_NOTAS, TAB_PEDIDOS_NOTA] : []),
    ...(podeVerComercial ? [TAB_COMERCIAL] : []),
    ...(podeGerenciarUsuarios ? [TAB_USUARIOS] : []),
    ...(isSuperAdmin ? [TAB_SUPER_ADMIN] : []),
  ];

  return (
    // Fixa logo abaixo do header (h-16, também sticky) pra trocar de tela sem
    // rolar até o topo; quebra em mais de uma linha em vez de rolar de lado.
    <nav className="sticky top-16 z-[9] -mx-4 flex flex-wrap gap-x-1 border-b border-border bg-background/95 px-4 backdrop-blur">
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-foreground/55 hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.href === TAB_PEDIDOS_NOTA.href && pendentes > 0 ? (
              <span
                className="ml-1.5 inline-flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-danger px-1.5 align-middle text-xs font-bold leading-none text-white"
                title={`${pendentes} pedido(s) de nota esperando o time`}
                aria-label={`${pendentes} pendente(s)`}
              >
                {pendentes > 99 ? "99+" : pendentes}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
