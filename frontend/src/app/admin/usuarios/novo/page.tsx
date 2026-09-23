import { redirect } from "next/navigation";
import { requireUser, temPermissao } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { NovoUsuarioForm } from "./NovoUsuarioForm";

export const metadata = { title: "Novo usuário — Painel SOMA" };

export default async function NovoUsuarioPage(
  props: PageProps<"/admin/usuarios/novo">,
) {
  await requireUser();
  const [podeEquipe, podeClientes] = await Promise.all([
    temPermissao("usuarios.gerenciar_equipe"),
    temPermissao("usuarios.gerenciar_clientes"),
  ]);
  if (!podeEquipe && !podeClientes) redirect("/");

  const searchParams = await props.searchParams;
  const empresaInicialId =
    typeof searchParams.empresa === "string" ? searchParams.empresa : undefined;

  const admin = createAdminClient();
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
      <h1 className="text-lg font-semibold text-foreground">Novo usuário</h1>
      <NovoUsuarioForm
        podeEditarGlobais={podeEquipe}
        empresasDisponiveis={empresasDisponiveis}
        empresaInicialId={empresaInicialId}
      />
    </div>
  );
}
