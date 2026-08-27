"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarConversa } from "@/lib/actions/chat-ia";
import { Button } from "@/components/ui/Button";

export function NovaConversaButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="secondary"
      size="md"
      className="w-full"
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const id = await criarConversa();
          router.push(`/admin/chat?conversa=${id}`);
        })
      }
    >
      + Nova conversa
    </Button>
  );
}
