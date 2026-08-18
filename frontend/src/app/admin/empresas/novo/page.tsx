import { NewCompanyForm } from "./NewCompanyForm";

export const metadata = { title: "Nova empresa — Painel SOMA" };

export default function NewCompanyPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Nova empresa</h1>
        <p className="text-sm text-foreground/60">
          Dados fiscais completos (regime tributário, certificado, serviços)
          são configurados depois, na Fase B.
        </p>
      </div>
      <NewCompanyForm />
    </div>
  );
}
