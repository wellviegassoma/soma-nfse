"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { contarPedidosPendentes } from "@/lib/actions/pedidos-nota";
import { cn } from "@/lib/cn";

type Tab = { href: string; label: string; exact?: boolean };

// Ordem pelo uso do dia a dia (17/11/2026). "Modelos de Precificação" saiu
// do menu (sem uso por enquanto — a página continua em
// /admin/precificacao-modelos). Comercial foi para a barra de cima, ao lado
// de Legalização (app/admin/layout.tsx).
const TAB_VISAO_GERAL: Tab = { href: "/admin", label: "Visão geral", exact: true };
// Rotina do mês da equipe (docs/tarefas.md).
const TAB_TAREFAS: Tab = { href: "/admin/tarefas", label: "Tarefas" };
// Carteira de IA do Simples (docs/simples-operacao-automatica.md).
const TAB_SERENA: Tab = { href: "/admin/serena", label: "Serena" };
// Carteira de IA do Lucro Presumido (Petrópolis + Rio).
const TAB_NEWTON: Tab = { href: "/admin/newton", label: "Newton" };
const TAB_EMPRESAS: Tab = { href: "/admin/empresas", label: "Empresas" };
const TAB_FECHAMENTO: Tab = { href: "/admin/fechamento", label: "Fechamento" };
// Caixa Postal do e-CAC de toda a carteira (docs: lib/caixa-postal-core.ts).
const TAB_INTIMACOES: Tab = { href: "/admin/intimacoes", label: "Intimações" };
// Simulador CBS/IBS da carteira (calculadoras RTC da Receita, Portaria Cotec 342/2026).
const TAB_REFORMA: Tab = { href: "/admin/reforma-tributaria", label: "Reforma Tributária" };
const TAB_CERTIFICADOS: Tab = { href: "/admin/certificados", label: "Certificados" };
const TAB_AUTOMACAO: Tab = { href: "/admin/automacao", label: "Automação" };
// Pouco usadas: no fim, depois de um separador, mais apagadas.
const TABS_SECUNDARIAS: Tab[] = [
  { href: "/admin/erros", label: "Erros" },
  { href: "/admin/logs", label: "Logs" },
  { href: "/admin/chat", label: "Chat IA" },
];

const TAB_EMISSAO_NOTAS: Tab = { href: "/admin/emissao-notas", label: "Emissão de Notas" };
// Pedidos sinalizados com #nota no Digisac (docs/pedido-nota-ia.md).
const TAB_PEDIDOS_NOTA: Tab = { href: "/admin/pedidos-nota", label: "Pedidos de Nota" };
const TAB_USUARIOS: Tab = { href: "/admin/usuarios", label: "Usuários" };
const TAB_SUPER_ADMIN: Tab = { href: "/admin/configuracoes", label: "Configurações" };

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
  pedidosPendentes = 0,
  intimacoesNovas = 0,
  tarefasUrgentes = 0,
  aviso,
}: {
  isSuperAdmin: boolean;
  podeGerenciarUsuarios: boolean;
  podeEmitirNotas: boolean;
  pedidosPendentes?: number;
  intimacoesNovas?: number;
  /** Minhas tarefas atrasadas + risco de multa (selo da aba Tarefas). */
  tarefasUrgentes?: number;
  /** Faixa fixa acima das abas (ex.: alerta de CNPJ fora de ATIVA). */
  aviso?: ReactNode;
}) {
  const pathname = usePathname();
  const pendentes = usePedidosPendentes(podeEmitirNotas, pedidosPendentes, pathname);
  const tabs = [
    TAB_VISAO_GERAL,
    TAB_TAREFAS,
    TAB_SERENA,
    TAB_NEWTON,
    TAB_EMPRESAS,
    ...(podeEmitirNotas ? [TAB_EMISSAO_NOTAS, TAB_PEDIDOS_NOTA] : []),
    TAB_FECHAMENTO,
    TAB_INTIMACOES,
    TAB_REFORMA,
    TAB_CERTIFICADOS,
    TAB_AUTOMACAO,
    ...(podeGerenciarUsuarios ? [TAB_USUARIOS] : []),
    ...(isSuperAdmin ? [TAB_SUPER_ADMIN] : []),
  ];

  return (
    // Fixa logo abaixo do header (h-16, também sticky) pra trocar de tela sem
    // rolar até o topo; quebra em mais de uma linha em vez de rolar de lado.
    <div className="sticky top-16 z-[9] -mx-4">
      {aviso}
      <nav className="flex flex-wrap gap-x-1 border-b border-border bg-background/95 px-4 backdrop-blur">
      {[...tabs, ...TABS_SECUNDARIAS].map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        const secundaria = TABS_SECUNDARIAS.includes(tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : secundaria
                  ? "border-transparent text-foreground/35 hover:text-foreground/70"
                  : "border-transparent text-foreground/55 hover:text-foreground",
              secundaria && tab === TABS_SECUNDARIAS[0] && "ml-auto",
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
            {tab.href === TAB_TAREFAS.href && tarefasUrgentes > 0 ? (
              <span
                className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-900 px-1.5 align-middle text-xs font-bold leading-none text-white"
                title={`${tarefasUrgentes} tarefa(s) sua(s) atrasada(s) ou em risco de multa`}
                aria-label={`${tarefasUrgentes} urgente(s)`}
              >
                {tarefasUrgentes > 99 ? "99+" : tarefasUrgentes}
              </span>
            ) : null}
            {tab.href === TAB_INTIMACOES.href && intimacoesNovas > 0 ? (
              <span
                className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 align-middle text-xs font-bold leading-none text-white"
                title={`${intimacoesNovas} mensagem(ns) da Caixa Postal sem ninguém tratando`}
                aria-label={`${intimacoesNovas} nova(s)`}
              >
                {intimacoesNovas > 99 ? "99+" : intimacoesNovas}
              </span>
            ) : null}
          </Link>
        );
      })}
      </nav>
    </div>
  );
}
