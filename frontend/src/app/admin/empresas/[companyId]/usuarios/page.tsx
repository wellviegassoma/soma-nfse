import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { InviteUserForm } from "../InviteUserForm";

export const metadata = { title: "Usuários — Painel SOMA" };

export default async function AdminCompanyUsersPage(
  props: PageProps<"/admin/empresas/[companyId]/usuarios">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("user_companies")
    .select("role, profile:profiles(id, full_name, email)")
    .eq("company_id", companyId);

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">
          Usuários com acesso
        </h2>
        {!members || members.length === 0 ? (
          <p className="text-sm text-foreground/50">Nenhum usuário ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m, i) => {
              const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
              return (
                <li
                  key={profile?.id ?? i}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {profile?.full_name || "—"}
                    </div>
                    <div className="text-xs text-foreground/50">
                      {profile?.email}
                    </div>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                    {ROLE_LABELS[m.role as UserRole]}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">
          Convidar usuário
        </h2>
        <InviteUserForm companyId={companyId} />
      </Card>
    </div>
  );
}
