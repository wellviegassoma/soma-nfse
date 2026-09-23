import Link from "next/link";
import { requireAtendimentoAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NovaConversaModal } from "@/components/atendimento/NovaConversaModal";

export default async function AtendimentoLayout({
  children,
}: LayoutProps<"/atendimento">) {
  await requireAtendimentoAccess();

  const supabase = await createClient();
  const { data: departamentos } = await supabase
    .from("atendimento_departamentos")
    .select("id, nome")
    .eq("ativo", true)
    .order("nome");

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex shrink-0 items-center gap-4 border-b border-border bg-surface/90 px-4 py-3">
        <span className="text-sm font-semibold text-foreground">Atendimento</span>
        <nav className="flex gap-1 text-sm">
          <Link
            href="/atendimento"
            className="rounded-lg px-3 py-1.5 font-medium text-foreground/70 hover:bg-surface-muted"
          >
            Inbox
          </Link>
          <Link
            href="/atendimento/conexoes"
            className="rounded-lg px-3 py-1.5 font-medium text-foreground/70 hover:bg-surface-muted"
          >
            Conexões
          </Link>
        </nav>
        <NovaConversaModal departamentos={departamentos ?? []} />
        <div className="ml-auto">
          <Link href="/admin" className="text-sm text-foreground/55 hover:text-foreground">
            Sair do Atendimento
          </Link>
        </div>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
