import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { formatarDataHora } from "@/lib/formatters";

export const metadata = { title: "Logs — Painel SOMA" };

type LogRow = {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  user: { full_name: string | null } | null;
  company: { legal_name: string; trade_name: string | null } | null;
};

const ACTION_LABEL: Record<string, string> = {
  CREATE: "criou",
  UPDATE: "atualizou",
  DELETE: "removeu",
  UPLOAD: "enviou",
  INVITE: "convidou usuário para",
  ISSUE: "emitiu",
  CANCEL: "cancelou",
};

export default async function AdminLogsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("audit_logs")
    .select(
      "id, action, entity, entity_id, created_at, user:profiles(full_name), company:companies(legal_name, trade_name)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const logs = (data ?? []) as unknown as LogRow[];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Logs de auditoria</h1>
        <p className="text-sm text-foreground/60">Últimos {logs.length} evento(s).</p>
      </div>

      {logs.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum evento registrado.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"
            >
              <span className="text-foreground">
                <span className="font-medium">{log.user?.full_name || "—"}</span>{" "}
                {ACTION_LABEL[log.action]?.toLowerCase() ?? log.action.toLowerCase()}{" "}
                <span className="text-foreground/60">{log.entity}</span>
                {log.company && (
                  <span className="text-foreground/50">
                    {" "}
                    · {log.company.trade_name || log.company.legal_name}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-foreground/45">
                {formatarDataHora(log.created_at)}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
