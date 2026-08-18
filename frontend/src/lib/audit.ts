import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Grava um evento de auditoria. Sempre via service role — nunca pela sessão
 * do usuário comum, pra o log não virar algo editável por quem está sendo
 * auditado (ver RLS de audit_logs: só SELECT, nenhuma policy de escrita).
 * Falha em silêncio (nunca deve quebrar a ação principal por causa do log).
 */
export async function logAudit(params: {
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const hdrs = await headers();
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      user_id: user.id,
      company_id: params.companyId ?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
      ip: hdrs.get("x-forwarded-for"),
      user_agent: hdrs.get("user-agent"),
    });
  } catch {
    // auditoria nunca derruba a ação principal
  }
}
