import Image from "next/image";
import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/soma-icon.png"
        alt="SOMA"
        width={32}
        height={32}
        className="h-8 w-8 shrink-0"
        priority
      />
      <div className="leading-none">
        <div className="text-[15px] font-semibold text-foreground">SOMA</div>
        <div className="text-[11px] font-medium tracking-wide text-foreground/50">
          Gestão
        </div>
      </div>
    </div>
  );
}
