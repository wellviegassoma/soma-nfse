"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Button } from "@/components/ui/Button";

type MensagemSalva = { id: string; role: "user" | "assistant"; content: string };

function paraUiMessage(m: MensagemSalva): UIMessage {
  return { id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] };
}

export function ChatIA({
  conversaId,
  mensagensIniciais,
}: {
  conversaId: string;
  mensagensIniciais: MensagemSalva[];
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    id: conversaId,
    messages: mensagensIniciais.map(paraUiMessage),
    transport: new DefaultChatTransport({ api: "/api/chat-ia", body: { conversaId } }),
  });

  const carregando = status === "streaming" || status === "submitted";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const texto = input.trim();
    if (!texto || carregando) return;
    sendMessage({ text: texto });
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 && (
          <p className="text-sm text-foreground/50">
            Pergunte algo sobre o sistema — faturamento, documentação pendente, certificados,
            sócios... Ex.: &quot;quais certificados vencem esse mês?&quot;
          </p>
        )}
        {messages.map((m) => {
          const texto = m.parts
            .filter((p): p is { type: "text"; text: string } => p.type === "text")
            .map((p) => p.text)
            .join("");
          if (!texto) return null;
          return (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "ml-auto max-w-[80%] rounded-lg bg-brand px-4 py-2.5 text-sm text-brand-foreground"
                  : "mr-auto max-w-[80%] whitespace-pre-wrap rounded-lg bg-surface-muted px-4 py-2.5 text-sm text-foreground"
              }
            >
              {texto}
            </div>
          );
        })}
        {carregando && <div className="mr-auto text-xs text-foreground/40">Pensando...</div>}
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border p-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          rows={2}
          placeholder="Pergunte algo sobre o sistema..."
          className="flex-1 resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        <Button type="submit" disabled={carregando || !input.trim()}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
