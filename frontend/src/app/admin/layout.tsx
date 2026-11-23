import { Suspense } from "react";
import Link from "next/link";
import { requireSomaStaff, requireUser, getCurrentProfileName, isSuperAdmin, temPermissao } from "@/lib/auth";
import { contarTarefasUrgentes } from "./MinhasTarefasResumo";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminNav } from "@/components/AdminNav";
import { AlertaCnpjGlobal } from "@/components/AlertaCnpjGlobal";
import { contarPedidosPendentes } from "@/lib/actions/pedidos-nota";
import { contarIntimacoesNovas } from "@/lib/caixa-postal";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: LayoutProps<"/admin">) {
  await requireSomaStaff();
  const user = await requireUser();
  // Depois do requireSomaStaff, usuário e permissões já estão em cache na
  // requisição — o resto sai junto, numa ida só ao banco (antes eram ~7
  // consultas em fila, ~1 s de piso em toda tela do painel).
  const supabase = await createClient();
  const [
    userName,
    superAdmin,
    podeGerenciarEquipe,
    podeGerenciarClientes,
    podeEmitirNotas,
    podeVerComercial,
    // Selo da aba Pedidos de Nota (o AdminNav atualiza sozinho a cada
    // minuto); contarPedidosPendentes já devolve 0 sem notas.emitir.
    pedidosPendentes,
    // Selo da aba Intimações: Caixa Postal do e-CAC sem ninguém tratando.
    intimacoesNovas,
    // Selo da aba Tarefas: minhas atrasadas + risco de multa.
    tarefasUrgentes,
  ] = await Promise.all([
    getCurrentProfileName(),
    isSuperAdmin(),
    temPermissao("usuarios.gerenciar_equipe"),
    temPermissao("usuarios.gerenciar_clientes"),
    temPermissao("notas.emitir"),
    temPermissao("comercial.ver"),
    contarPedidosPendentes().catch(() => 0),
    contarIntimacoesNovas(supabase).catch(() => 0),
    contarTarefasUrgentes(supabase, user.id).catch(() => 0),
  ]);
  const podeGerenciarUsuarios = podeGerenciarEquipe || podeGerenciarClientes;

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">
              Painel de Administração
            </span>
          </div>
          <div className="flex items-center gap-2">
            {podeVerComercial && (
              <Link
                href="/comercial"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
              >
                Comercial
              </Link>
            )}
            <Link
              href="/legalizacao"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Legalização
            </Link>
            <Link
              href="/extratos"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Extratos
            </Link>
            <Link
              href="/irpf"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              IRPF
            </Link>
            {/* Financeiro e Atendimento saíram da barra (17/11/2026, sem uso por
                enquanto) — as páginas /financeiro e /atendimento continuam. */}
            <div className="hidden h-8 w-px bg-border sm:block" />
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Sair do painel
            </Link>
            {userName && (
              <span className="hidden text-sm text-foreground/60 md:inline">
                {userName}
              </span>
            )}
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] px-4 py-8">
        <AdminNav
          isSuperAdmin={superAdmin}
          podeGerenciarUsuarios={podeGerenciarUsuarios}
          podeEmitirNotas={podeEmitirNotas}
          pedidosPendentes={pedidosPendentes}
          intimacoesNovas={intimacoesNovas}
          tarefasUrgentes={tarefasUrgentes}
          aviso={
            // Em Suspense pra não segurar o cabeçalho nem o loading.tsx
            // enquanto a consulta da faixa vermelha roda.
            <Suspense fallback={null}>
              <AlertaCnpjGlobal />
            </Suspense>
          }
        />
        <div className="pt-6">{children}</div>
      </div>
    </div>
  );
}
