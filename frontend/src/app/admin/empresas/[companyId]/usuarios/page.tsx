import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Usuários — Painel SOMA" };

export default async function AdminCompanyUsersPage(
  props: PageProps<"/admin/empresas/[companyId]/usuarios">,
) {
  const { companyId } = await props.params;
  const admin = createAdminClient();

  const { data: linhas } = await admin
    .from("usuario_permissoes")
    .select("user_id, permissao, profile:profiles(id, full_name, email)")
    .eq("company_id", companyId);

  const porUsuario = new Map<
    string,
    { profile: { id: string; full_name: string | null; email: string | null } | null; qtd: number }
  >();
  for (const linha of linhas ?? []) {
    const profile = Array.isArray(linha.profile) ? linha.profile[0] : linha.profile;
    if (!porUsuario.has(linha.user_id)) {
      porUsuario.set(linha.user_id, { profile: profile ?? null, qtd: 0 });
    }
    porUsuario.get(linha.user_id)!.qtd += 1;
  }
  const usuarios = [...porUsuario.entries()];

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground/70">Usuários com acesso</h2>
          <Link href={`/admin/usuarios/novo?empresa=${companyId}`}>
            <Button size="md">Dar acesso</Button>
          </Link>
        </div>
        {usuarios.length === 0 ? (
          <p className="text-sm text-foreground/50">Nenhum usuário ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {usuarios.map(([userId, { profile, qtd }]) => (
              <li key={userId}>
                <Link
                  href={`/admin/usuarios/${userId}`}
                  className="flex items-center justify-between py-3 text-sm hover:opacity-70"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {profile?.full_name || "—"}
                    </div>
                    <div className="text-xs text-foreground/50">{profile?.email}</div>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                    {qtd} {qtd === 1 ? "permissão" : "permissões"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
