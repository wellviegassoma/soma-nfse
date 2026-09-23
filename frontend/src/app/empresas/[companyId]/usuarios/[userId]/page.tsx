import { notFound } from "next/navigation";
import { requirePermissao, getCompanyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { PERMISSOES, type Permissao } from "@/lib/permissoes/catalogo";
import { EditarUsuarioEmpresa } from "./EditarUsuarioEmpresa";

export const metadata = { title: "Editar acesso — Usuários da empresa" };

export default async function EditarUsuarioEmpresaPage(
  props: PageProps<"/empresas/[companyId]/usuarios/[userId]">,
) {
  const { companyId, userId } = await props.params;
  await requirePermissao("usuarios_empresa.gerenciar", companyId);

  const access = await getCompanyAccess(companyId);
  const permissoesDisponiveis = (access?.permissoes ?? []).filter(
    (p) => PERMISSOES[p]?.escopo !== "GLOBAL",
  );

  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("profiles")
    .select("id, full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil) notFound();

  const { data: linhas } = await admin
    .from("usuario_permissoes")
    .select("permissao")
    .eq("user_id", userId)
    .eq("company_id", companyId);
  const permissoesIniciais = (linhas ?? []).map((l) => l.permissao as Permissao);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{perfil.full_name || "Usuário sem nome"}</h1>
        <p className="text-sm text-foreground/50">{perfil.email}</p>
      </div>
      <Card className="p-6">
        <EditarUsuarioEmpresa
          userId={userId}
          companyId={companyId}
          permissoesDisponiveis={permissoesDisponiveis}
          permissoesIniciais={permissoesIniciais}
        />
      </Card>
    </div>
  );
}
