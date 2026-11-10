import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { ConfirmarLinkForm } from "./ConfirmarLinkForm";

export const metadata = { title: "Acessar — SOMA Gestão" };

// Alvo do link dos e-mails de convite e de redefinição de senha (templates em
// supabase/templates). O token NÃO é validado ao abrir a página: filtros de
// e-mail (Outlook Safe Links etc.) abrem o link antes da pessoa e gastariam o
// token. Ele só é usado quando a pessoa clica no botão (POST via server action).
export default async function ConfirmarLinkPage(props: PageProps<"/auth/confirm">) {
  const searchParams = await props.searchParams;
  const tokenHash = typeof searchParams.token_hash === "string" ? searchParams.token_hash : "";
  const type = typeof searchParams.type === "string" ? searchParams.type : "";
  const next = typeof searchParams.next === "string" ? searchParams.next : "/redefinir-senha";

  if (!tokenHash || !type) redirect("/login?erro=link-invalido");

  const convite = type === "invite" || type === "signup";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="p-6 sm:p-8">
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            {convite ? "Bem-vindo ao SOMA Gestão" : "Redefinir sua senha"}
          </h1>
          <p className="mb-6 text-sm text-foreground/60">
            {convite
              ? "Clique no botão abaixo para criar a sua senha de acesso."
              : "Clique no botão abaixo para escolher uma nova senha."}
          </p>

          <ConfirmarLinkForm
            tokenHash={tokenHash}
            type={type}
            next={next}
            textoBotao={convite ? "Criar minha senha" : "Definir nova senha"}
          />
        </Card>
      </div>
    </main>
  );
}
