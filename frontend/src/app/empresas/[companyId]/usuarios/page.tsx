import Link from "next/link";
import { requirePermissao, getCompanyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { PERMISSOES, type Permissao } from "@/lib/permissoes/catalogo";
import { NovoUsuarioEmpresaForm } from "./NovoUsuarioEmpresaForm";

export const metadata = { title: "Usuários da empresa" };

export default async function EmpresaUsuariosPage(
  props: PageProps<"/empresas/[companyId]/usuarios">,
) {
  const { companyId } = await props.params;
  await requirePermissao("usuarios_empresa.gerenciar", companyId);

  const access = await getCompanyAccess(companyId);
  const permissoesDisponiveis = (access?.permissoes ?? []).filter(
    (p) => PERMISSOES[p]?.escopo !== "GLOBAL",
  );

  const admin = createAdminClient();
  const { data: linhas } = await admin
    .from("usuario_permissoes")
    .select("user_id, permissao, profile:profiles(id, full_name, email)")
    .eq("company_id", companyId);

  const porUsuario = new Map<
    string,
    { profile: { id: string; full_name: string | null; email: string | null } | null; permissoes: Permissao[] }
  >();
  for (const linha of linhas ?? []) {
    const profile = Array.isArray(linha.profile) ? linha.profile[0] : linha.profile;
    if (!porUsuario.has(linha.user_id)) {
      porUsuario.set(linha.user_id, { profile: profile ?? null, permissoes: [] });
    }
    porUsuario.get(linha.user_id)!.permissoes.push(linha.permissao as Permissao);
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Usuários com acesso</h2>
        {porUsuario.size === 0 ? (
          <p className="text-sm text-foreground/50">Nenhum usuário ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...porUsuario.entries()].map(([userId, { profile, permissoes }]) => (
              <li key={userId}>
                <Link
                  href={`/empresas/${companyId}/usuarios/${userId}`}
                  className="flex items-center justify-between py-3 text-sm hover:opacity-70"
                >
                  <div>
                    <div className="font-medium text-foreground">{profile?.full_name || "—"}</div>
                    <div className="text-xs text-foreground/50">{profile?.email}</div>
                  </div>
                  <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                    {permissoes.length} {permissoes.length === 1 ? "permissão" : "permissões"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Dar acesso a alguém novo</h2>
        <NovoUsuarioEmpresaForm companyId={companyId} permissoesDisponiveis={permissoesDisponiveis} />
      </Card>
    </div>
  );
}
