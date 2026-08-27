import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Esqueci minha senha — SOMA Gestão" };

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="p-6 sm:p-8">
          <h1 className="mb-2 text-lg font-semibold text-foreground">
            Esqueci minha senha
          </h1>
          <p className="mb-6 text-sm text-foreground/60">
            Informe o e-mail cadastrado e enviaremos um link para você criar
            uma nova senha.
          </p>

          <ForgotPasswordForm />
        </Card>
      </div>
    </main>
  );
}
