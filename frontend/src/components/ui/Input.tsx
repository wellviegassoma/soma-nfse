import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-[15px] text-foreground placeholder:text-foreground/40 outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15",
        className,
      )}
      {...props}
    />
  );
});
