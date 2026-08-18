"use client";

import { useTransition } from "react";
import { deleteCertificate } from "@/lib/actions/certificado";
import { Button } from "@/components/ui/Button";

export function DeleteCertificateButton({ companyId }: { companyId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="danger"
      loading={pending}
      onClick={() => {
        if (!confirm("Remover o certificado desta empresa?")) return;
        startTransition(() => deleteCertificate(companyId));
      }}
    >
      Remover certificado
    </Button>
  );
}
