import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/Card";
import { UpdatePasswordForm } from "./UpdatePasswordForm";

export const metadata = { title: "Redefinir senha — SOMA Gestão" };

export default function UpdatePasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <Card className="p-6 sm:p-8">
          <h1 className="mb-6 text-lg font-semibold text-foreground">
            Defina sua nova senha
          </h1>

          <UpdatePasswordForm />
        </Card>
      </div>
    </main>
  );
}
