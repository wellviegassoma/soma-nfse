import { notFound, redirect } from "next/navigation";
import { requireUser, temPermissao } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { EditarPermissoesUsuario } from "./EditarPermissoesUsuario";
import { UsuarioAcoes } from "./UsuarioAcoes";
import type { Permissao } from "@/lib/permissoes/catalogo";
import type { EmpresaGrid } from "@/components/usuarios/PermissoesGrid";

export const metadata = { title: "Editar usuário — Painel SOMA" };

export default async function EditarUsuarioPage(
  props: PageProps<"/admin/usuarios/[userId]">,
) {
  await requireUser();
  const [podeEquipe, podeClientes] = await Promise.all([
    temPermissao("usuarios.gerenciar_equipe"),
    temPermissao("usuarios.gerenciar_clientes"),
  ]);
  if (!podeEquipe && !podeClientes) redirect("/");

  const { userId } = await props.params;
  const admin = createAdminClient();

  const { data: perfil } = await admin
    .from("profiles")
    .select("id, full_name, email, ativo")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil) notFound();

  const { data: linhas } = await admin
    .from("usuario_permissoes")
    .select("permissao, company_id, company:companies(id, legal_name, trade_name)")
    .eq("user_id", userId);

  const permissoesGlobaisIniciais: Permissao[] = [];
  const empresasMap = new Map<string, EmpresaGrid>();
  for (const linha of (linhas ?? []) as unknown as {
    permissao: Permissao;
    company_id: string | null;
    company: { id: string; legal_name: string; trade_name: string | null } | null;
  }[]) {
    if (!linha.company_id) {
      permissoesGlobaisIniciais.push(linha.permissao);
      continue;
    }
    if (!empresasMap.has(linha.company_id)) {
      empresasMap.set(linha.company_id, {
        companyId: linha.company_id,
        nome: linha.company?.trade_name || linha.company?.legal_name || "Empresa",
        permissoes: new Set(),
      });
    }
    empresasMap.get(linha.company_id)!.permissoes.add(linha.permissao);
  }

  const { data: companies } = await admin
    .from("companies")
    .select("id, legal_name, trade_name")
    .order("legal_name", { ascending: true });
  const empresasDisponiveis = (companies ?? []).map((c) => ({
    id: c.id,
    nome: c.trade_name || c.legal_name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {perfil.full_name || "Usuário sem nome"}
        </h1>
        <p className="text-sm text-foreground/50">{perfil.email}</p>
      </div>

      <Card className="p-6">
        <UsuarioAcoes userId={userId} email={perfil.email} ativo={perfil.ativo} />
      </Card>

      <Card className="p-6">
        <EditarPermissoesUsuario
          userId={userId}
          podeEditarGlobais={podeEquipe}
          permissoesGlobaisIniciais={permissoesGlobaisIniciais}
          empresasIniciais={[...empresasMap.values()]}
          empresasDisponiveis={empresasDisponiveis}
        />
      </Card>
    </div>
  );
}
