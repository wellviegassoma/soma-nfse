import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { DpsListItem } from "@/lib/types";

export const metadata = { title: "Notas fiscais — SOMA NFS-e" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// new Date("2026-08-18") vira meia-noite UTC — em fuso atrás de UTC (ex.:
// America/Sao_Paulo), toLocaleDateString mostraria 17/08. Formata a data
// pura sem passar por Date/fuso horário nenhum.
function formatDateOnly(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACCEPTED: { label: "Emitida", className: "bg-success-soft text-success" },
  REJECTED: { label: "Rejeitada", className: "bg-danger-soft text-danger" },
};

export default async function NotasPage(
  props: PageProps<"/empresas/[companyId]/notas">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: notas } = await supabase
    .from("dps")
    .select(
      "id, numero_dps, serie, valor, data_competencia, status, created_at, customer:customers(name), service:services(name), nfse(access_key)",
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const lista = (notas ?? []) as unknown as DpsListItem[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Notas fiscais</h1>
          <p className="text-sm text-foreground/60">{lista.length} nota(s)</p>
        </div>
        <Link href={`/empresas/${companyId}/emitir`}>
          <Button>+ Emitir nota</Button>
        </Link>
      </div>

      {lista.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma nota emitida ainda.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {lista.map((nota) => {
            const status = STATUS_LABEL[nota.status] ?? STATUS_LABEL.REJECTED;
            return (
              <Link
                key={nota.id}
                href={`/empresas/${companyId}/notas/${nota.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {nota.customer?.name ?? "—"}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    {nota.serie}/{nota.numero_dps} · {nota.service?.name ?? "—"} ·{" "}
                    {formatDateOnly(nota.data_competencia)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-foreground">
                    {formatMoney(nota.valor)}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
