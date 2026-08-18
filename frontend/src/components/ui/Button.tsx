import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-brand text-brand-foreground hover:bg-brand-hover disabled:bg-brand/50",
  secondary:
    "bg-surface text-foreground border border-border hover:bg-surface-muted disabled:opacity-50",
  ghost: "text-foreground hover:bg-surface-muted disabled:opacity-50",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};

const sizeClasses: Record<Size, string> = {
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
  }
>(function Button(
  { className, variant = "primary", size = "md", loading, disabled, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors cursor-pointer disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
});
