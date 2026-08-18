"use client";

import { useTransition } from "react";
import { toggleServiceActive } from "@/lib/actions/servicos";
import { cn } from "@/lib/cn";

export function ActiveToggle({
  companyId,
  serviceId,
  active,
}: {
  companyId: string;
  serviceId: string;
  active: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(() => toggleServiceActive(companyId, serviceId, !active));
      }}
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-medium transition-opacity",
        active
          ? "bg-success-soft text-success"
          : "bg-surface-muted text-foreground/50",
        pending && "opacity-50",
      )}
    >
      {active ? "Ativo" : "Inativo"}
    </button>
  );
}
