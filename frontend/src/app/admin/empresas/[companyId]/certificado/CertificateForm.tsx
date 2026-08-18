"use client";

import { useActionState } from "react";
import { uploadCertificate } from "@/lib/actions/certificado";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function CertificateForm({ companyId }: { companyId: string }) {
  const [state, formAction, pending] = useActionState(uploadCertificate, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="companyId" value={companyId} />

      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Certificado salvo com sucesso.</Alert>}

      <Field label="Arquivo do certificado (.pfx ou .p12)" htmlFor="file">
        <Input id="file" name="file" type="file" accept=".pfx,.p12" required />
      </Field>

      <Field label="Senha do certificado" htmlFor="password">
        <Input id="password" name="password" type="password" required />
      </Field>

      <div>
        <Button type="submit" loading={pending}>
          Enviar certificado
        </Button>
      </div>
    </form>
  );
}
