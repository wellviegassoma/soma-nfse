import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { CertificateForm } from "./CertificateForm";
import { DeleteCertificateButton } from "./DeleteCertificateButton";
import { ETAPA_LABEL, type Etapa } from "@/lib/certificado-acompanhamento";
import { formatarDataHora } from "@/lib/formatters";

type EventoAcompanhamento = {
  id: string;
  status: Etapa;
  referente_vencimento: string | null;
  observacao: string | null;
  proximo_contato: string | null;
  criado_em: string;
  autor: { full_name: string | null } | null;
};

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
  const [{ data: certificate }, { data: eventosData }] = await Promise.all([
    supabase
      .from("certificates")
      .select("id, fingerprint, expires_at, created_at")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("certificado_acompanhamento_eventos")
      .select(
        "id, status, referente_vencimento, observacao, proximo_contato, criado_em, autor:profiles!certificado_acompanhamento_eventos_criado_por_fkey(full_name)",
      )
      .eq("company_id", companyId)
      .order("criado_em", { ascending: false })
      .limit(50),
  ]);
  const eventos = (eventosData ?? []) as unknown as EventoAcompanhamento[];

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
      {eventos.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-1 text-sm font-semibold text-foreground/70">Histórico do acompanhamento</h2>
          <p className="mb-4 text-xs text-foreground/50">
            Etapas registradas pela equipe em Certificados — a mais recente primeiro.
          </p>
          <ol className="flex flex-col divide-y divide-border">
            {eventos.map((ev) => (
              <li key={ev.id} className="flex flex-col gap-0.5 py-2 text-sm">
                <div>
                  <span className="font-medium text-foreground">{ETAPA_LABEL[ev.status]}</span>
                  <span className="text-foreground/50">
                    {" "}
                    · {formatarDataHora(ev.criado_em)}
                    {ev.autor?.full_name ? ` · ${ev.autor.full_name}` : ""}
                  </span>
                </div>
                <div className="text-xs text-foreground/50">
                  {ev.referente_vencimento
                    ? `Certificado com vencimento em ${new Date(ev.referente_vencimento).toLocaleDateString("pt-BR")}`
                    : "Empresa sem certificado"}
                  {ev.proximo_contato && ` · próximo contato ${ev.proximo_contato.split("-").reverse().join("/")}`}
                </div>
                {ev.observacao && <div className="text-foreground/70">{ev.observacao}</div>}
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}
