import Link from "next/link";
import { requireIrpfAccess, getCurrentProfileName, isSomaStaff, temPermissao } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { IrpfNav } from "./IrpfNav";

// Módulo IRPF (docs/irpf.md): base de contribuintes própria, separada das
// empresas. Só equipe SOMA. O cabeçalho some na impressão do relatório.
export default async function IrpfLayout({ children }: LayoutProps<"/irpf">) {
  await requireIrpfAccess();
  const [userName, staff, comercial] = await Promise.all([
    getCurrentProfileName(),
    isSomaStaff(),
    temPermissao("comercial.ver"),
  ]);

  return (
    <div className="min-h-dvh bg-background print:bg-white">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-4">
            <Logo />
            <div className="hidden h-8 w-px bg-border sm:block" />
            <span className="hidden text-sm font-semibold text-foreground/70 sm:inline">Imposto de Renda PF</span>
          </div>
          <div className="flex items-center gap-2">
            {staff && (
              <Link href="/admin" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block">
                Painel
              </Link>
            )}
            {!staff && comercial && (
              <Link href="/comercial" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block">
                Comercial
              </Link>
            )}
            <Link
              href="/"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-surface-muted sm:inline-block"
            >
              Sair do módulo
            </Link>
            {userName && <span className="hidden text-sm text-foreground/60 md:inline">{userName}</span>}
            <LogoutButton />
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 print:max-w-none print:p-0">
        <div className="print:hidden">
          <IrpfNav />
        </div>
        <div className="pt-6 print:pt-0">{children}</div>
      </div>
    </div>
  );
}
