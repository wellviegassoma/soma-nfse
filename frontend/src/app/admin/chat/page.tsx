import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { listarConversas, buscarMensagens } from "@/lib/actions/chat-ia";
import { NovaConversaButton } from "./NovaConversaButton";
import { ApagarConversaButton } from "./ApagarConversaButton";
import { ChatIA } from "./ChatIA";

export const metadata = { title: "Chat IA — Painel SOMA" };

export default async function ChatIAPage(props: PageProps<"/admin/chat">) {
  const searchParams = await props.searchParams;
  const conversaIdParam = typeof searchParams.conversa === "string" ? searchParams.conversa : undefined;

  const conversas = await listarConversas();
  const conversaId = conversaIdParam ?? conversas[0]?.id;
  const mensagens = conversaId ? await buscarMensagens(conversaId) : [];

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4">
      <Card className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden p-3">
        <NovaConversaButton />
        <div className="flex flex-col gap-1 overflow-y-auto">
          {conversas.map((c) => (
            <Link
              key={c.id}
              href={`/admin/chat?conversa=${c.id}`}
              className={cn(
                "group flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                c.id === conversaId ? "bg-brand/10 text-brand" : "text-foreground/70 hover:bg-surface-muted",
              )}
            >
              <span className="truncate">{c.titulo}</span>
              <ApagarConversaButton conversaId={c.id} ativa={c.id === conversaId} />
            </Link>
          ))}
        </div>
      </Card>

      <Card className="flex-1 overflow-hidden">
        {conversaId ? (
          <ChatIA key={conversaId} conversaId={conversaId} mensagensIniciais={mensagens} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-foreground/50">
            Clique em &quot;Nova conversa&quot; pra começar.
          </div>
        )}
      </Card>
    </div>
  );
}
