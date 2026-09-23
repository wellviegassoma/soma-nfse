import Link from "next/link";
import { requireUser, temPermissao } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Usuários — Painel SOMA" };

export default async function UsuariosPage() {
  await requireUser();
  const [podeEquipe, podeClientes] = await Promise.all([
    temPermissao("usuarios.gerenciar_equipe"),
    temPermissao("usuarios.gerenciar_clientes"),
  ]);
  if (!podeEquipe && !podeClientes) redirect("/");

  const admin = createAdminClient();

  const { data: permissoes } = await admin
    .from("usuario_permissoes")
    .select("user_id, company_id");

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, email, ativo");

  const perfilPorId = new Map((profiles ?? []).map((p) => [p.id, p]));

  const resumoPorUsuario = new Map<
    string,
    { global: boolean; empresas: Set<string> }
  >();
  for (const row of permissoes ?? []) {
    if (!resumoPorUsuario.has(row.user_id)) {
      resumoPorUsuario.set(row.user_id, { global: false, empresas: new Set() });
    }
    const resumo = resumoPorUsuario.get(row.user_id)!;
    if (row.company_id) resumo.empresas.add(row.company_id);
    else resumo.global = true;
  }

  const usuarios = [...resumoPorUsuario.entries()]
    .map(([userId, resumo]) => ({
      userId,
      perfil: perfilPorId.get(userId),
      global: resumo.global,
      qtdEmpresas: resumo.empresas.size,
    }))
    .filter((u) => u.perfil)
    .sort((a, b) => (a.perfil!.full_name ?? "").localeCompare(b.perfil!.full_name ?? ""));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-foreground">Usuários</h1>
        <Link href="/admin/usuarios/novo">
          <Button>+ Novo usuário</Button>
        </Link>
      </div>

      <Card className="p-0">
        {usuarios.length === 0 ? (
          <p className="p-6 text-sm text-foreground/50">Nenhum usuário cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-border">
            {usuarios.map((u) => (
              <li key={u.userId}>
                <Link
                  href={`/admin/usuarios/${u.userId}`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm hover:bg-surface-muted"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {u.perfil?.full_name || "—"}
                    </div>
                    <div className="text-xs text-foreground/50">{u.perfil?.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!u.perfil?.ativo && (
                      <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-medium text-danger">
                        Suspenso
                      </span>
                    )}
                    {u.global && (
                      <span className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-medium text-brand">
                        Equipe SOMA
                      </span>
                    )}
                    {u.qtdEmpresas > 0 && (
                      <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-foreground/60">
                        {u.qtdEmpresas} {u.qtdEmpresas === 1 ? "empresa" : "empresas"}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
