import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { CertificateForm } from "./CertificateForm";
import { DeleteCertificateButton } from "./DeleteCertificateButton";

export const metadata = { title: "Certificado — Painel SOMA" };

function statusFor(expiresAt: string) {
  const days = (new Date(expiresAt).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return { label: "Vencido", tone: "danger" as const };
  if (days < 30) return { label: `Vence em ${Math.ceil(days)} dia(s)`, tone: "warning" as const };
  return { label: "Válido", tone: "success" as const };
}

export default async function AdminCompanyCertificatePage(
  props: PageProps<"/admin/empresas/[companyId]/certificado">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  // Nunca selecionar encrypted_file/encrypted_password aqui — só metadados.
  const { data: certificate } = await supabase
    .from("certificates")
    .select("id, fingerprint, expires_at, created_at")
    .eq("company_id", companyId)
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      {certificate && (
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">
            Certificado atual
          </h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-foreground/50">Status</dt>
              <dd className="text-sm font-medium text-foreground">
                <Alert tone={statusFor(certificate.expires_at).tone}>
                  {statusFor(certificate.expires_at).label}
                </Alert>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/50">Validade</dt>
              <dd className="text-sm font-medium text-foreground">
                {new Date(certificate.expires_at).toLocaleDateString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-foreground/50">Fingerprint (SHA-256)</dt>
              <dd className="break-all font-mono text-xs text-foreground/70">
                {certificate.fingerprint}
              </dd>
            </div>
          </dl>
          <div className="mt-4">
            <DeleteCertificateButton companyId={companyId} />
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">
          {certificate ? "Substituir certificado" : "Enviar certificado"}
        </h2>
        <p className="mb-4 text-sm text-foreground/50">
          O arquivo e a senha ficam cifrados (AES-256-GCM) — ninguém, nem a
          equipe, consegue ler o certificado de volta pelo painel.
        </p>
        <CertificateForm companyId={companyId} />
      </Card>
    </div>
  );
}
