import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "danger" | "success" | "warning";

const toneClasses: Record<Tone, string> = {
  danger: "bg-danger-soft text-danger border-danger/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
};

export function Alert({ tone = "danger", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-3.5 py-2.5 text-sm font-medium",
        toneClasses[tone],
      )}
    >
      {children}
    </div>
  );
}
