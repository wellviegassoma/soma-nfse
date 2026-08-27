"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apagarConversa } from "@/lib/actions/chat-ia";

export function ApagarConversaButton({ conversaId, ativa }: { conversaId: string; ativa: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (confirmando) {
    return (
      <span className="flex items-center gap-1.5 text-xs">
        <button
          type="button"
          className="text-danger underline"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await apagarConversa(conversaId);
              if (ativa) router.push("/admin/chat");
            });
          }}
        >
          Sim
        </button>
        <button
          type="button"
          className="text-foreground/50 underline"
          onClick={(e) => {
            e.preventDefault();
            setConfirmando(false);
          }}
        >
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      className="text-xs text-foreground/30 opacity-0 hover:text-danger group-hover:opacity-100"
      onClick={(e) => {
        e.preventDefault();
        setConfirmando(true);
      }}
    >
      Remover
    </button>
  );
}
