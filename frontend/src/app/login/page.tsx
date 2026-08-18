import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar — SOMA NFS-e" };

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : "/";
  const linkInvalido = searchParams.erro === "link-invalido";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="p-6 sm:p-8">
          <h1 className="mb-6 text-lg font-semibold text-foreground">Entrar</h1>

          {linkInvalido && (
            <div className="mb-4">
              <Alert tone="warning">
                Esse link expirou ou já foi usado. Peça um novo em &ldquo;Esqueci minha
                senha&rdquo;.
              </Alert>
            </div>
          )}

          <LoginForm next={next} />
        </Card>

        <p className="mt-6 text-center text-xs text-foreground/45">
          Acesso restrito a clientes e à equipe da SOMA Contabilidade.
        </p>
      </div>
    </main>
  );
}
