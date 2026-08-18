import { SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
