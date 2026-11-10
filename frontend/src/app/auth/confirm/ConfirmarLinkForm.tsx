"use client";

import { useActionState } from "react";
import { confirmarLinkEmail } from "@/lib/actions/auth";
import { Button } from "@/components/ui/Button";

export function ConfirmarLinkForm({
  tokenHash,
  type,
  next,
  textoBotao,
}: {
  tokenHash: string;
  type: string;
  next: string;
  textoBotao: string;
}) {
  const [, formAction, pending] = useActionState(confirmarLinkEmail, undefined);

  return (
    <form action={formAction}>
      <input type="hidden" name="token_hash" value={tokenHash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="lg" loading={pending} className="w-full">
        {textoBotao}
      </Button>
    </form>
  );
}
