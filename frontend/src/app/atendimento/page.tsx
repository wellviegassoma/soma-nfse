import { InboxShell } from "@/components/atendimento/InboxShell";

export const metadata = { title: "Atendimento — Inbox" };

export default async function AtendimentoPage(props: PageProps<"/atendimento">) {
  const searchParams = await props.searchParams;
  const aba = typeof searchParams.aba === "string" ? searchParams.aba : "fila";

  return (
    <InboxShell aba={aba}>
      <div className="flex h-full items-center justify-center text-sm text-foreground/45">
        Selecione um chamado para ver a conversa.
      </div>
    </InboxShell>
  );
}
