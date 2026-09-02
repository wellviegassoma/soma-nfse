import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { formatarDataHora } from "@/lib/formatters";

export const metadata = { title: "Erros — Painel SOMA" };

type ErrorRow = {
  id: string;
  technical_message: string;
  user_message: string;
  created_at: string;
  company: { legal_name: string; trade_name: string | null } | null;
  creator: { full_name: string | null } | null;
  dps: { id_dps: string; numero_dps: number } | null;
};

export default async function AdminErrorsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("nfse_errors")
    .select(
      "id, technical_message, user_message, created_at, company:companies(legal_name, trade_name), creator:profiles(full_name), dps:dps(id_dps, numero_dps)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const erros = (data ?? []) as unknown as ErrorRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Erros de emissão</h1>
        <p className="text-sm text-foreground/60">
          Últimos {erros.length} erro(s) — visível só para a equipe SOMA.
        </p>
      </div>

      {erros.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum erro registrado.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {erros.map((erro) => (
            <div key={erro.id} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/50">
                <span>
                  {erro.company?.trade_name || erro.company?.legal_name || "—"}
                  {erro.creator?.full_name ? ` · ${erro.creator.full_name}` : ""}
                  {erro.dps ? ` · DPS ${erro.dps.numero_dps}` : ""}
                </span>
                <span>{formatarDataHora(erro.created_at)}</span>
              </div>
              <p className="break-all font-mono text-xs text-foreground/80">
                {erro.technical_message}
              </p>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
