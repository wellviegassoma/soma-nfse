import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-brand-foreground">
        S
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-semibold text-foreground">SOMA</div>
        <div className="text-[11px] font-medium tracking-wide text-foreground/50">
          NFS-e
        </div>
      </div>
    </div>
  );
}
