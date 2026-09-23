"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, temPermissao } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { expandirImplicacoes, type Permissao } from "@/lib/permissoes/catalogo";

export type EmpresaPermissoes = { companyId: string; permissoes: Permissao[] };

async function requireGerenciarUsuarios() {
  await requireUser();
  const [podeEquipe, podeClientes] = await Promise.all([
    temPermissao("usuarios.gerenciar_equipe"),
    temPermissao("usuarios.gerenciar_clientes"),
  ]);
  if (!podeEquipe && !podeClientes) redirect("/");
  return { podeEquipe, podeClientes };
}

function montarLinhasPermissoes(
  permissoesGlobais: Permissao[],
  empresas: EmpresaPermissoes[],
): { permissao: string; company_id: string | null }[] {
  const linhas: { permissao: string; company_id: string | null }[] = expandirImplicacoes(
    permissoesGlobais,
  ).map((p) => ({ permissao: p, company_id: null }));

  for (const empresa of empresas) {
    for (const p of expandirImplicacoes(empresa.permissoes)) {
      linhas.push({ permissao: p, company_id: empresa.companyId });
    }
  }
  return linhas;
}

export async function convidarUsuario(input: {
  email: string;
  fullName: string;
  permissoesGlobais: Permissao[];
  empresas: EmpresaPermissoes[];
}): Promise<{ error?: string; userId?: string }> {
  const { podeEquipe } = await requireGerenciarUsuarios();

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email("E-mail inválido."),
      fullName: z.string().trim().min(2, "Informe o nome."),
    })
    .safeParse({ email: input.email, fullName: input.fullName });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { email, fullName } = parsed.data;

  if (input.permissoesGlobais.length > 0 && !podeEquipe) {
    return { error: "Só quem gerencia a equipe SOMA pode conceder permissões globais." };
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
  });

  let userId = invited?.user?.id;

  // E-mail já existe no Auth (acesso a outra empresa, ex-funcionário etc.) —
  // reaproveita a conta em vez de tentar convidar de novo.
  if (inviteError) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (!existing) {
      return { error: "Não foi possível convidar esse e-mail." };
    }
    userId = existing.id;
  }
  if (!userId) {
    return { error: "Não foi possível identificar o usuário convidado." };
  }

  const supabase = await createClient();
  const linhas = montarLinhasPermissoes(input.permissoesGlobais, input.empresas);
  const { error: rpcError } = await supabase.rpc("definir_permissoes_usuario", {
    p_user_id: userId,
    p_permissoes: linhas,
    p_company_id: null,
  });
  if (rpcError) return { error: rpcError.message };

  await logAudit({
    action: "INVITE",
    entity: "usuario_permissoes",
    entityId: userId,
    newValue: { email, permissoesGlobais: input.permissoesGlobais, empresas: input.empresas },
  });

  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${userId}`);
}

export async function salvarPermissoesUsuario(
  userId: string,
  permissoesGlobais: Permissao[],
  empresas: EmpresaPermissoes[],
): Promise<{ error?: string; success?: boolean }> {
  const { podeEquipe } = await requireGerenciarUsuarios();
  if (permissoesGlobais.length > 0 && !podeEquipe) {
    return { error: "Só quem gerencia a equipe SOMA pode conceder permissões globais." };
  }

  const supabase = await createClient();
  const linhas = montarLinhasPermissoes(permissoesGlobais, empresas);
  const { error } = await supabase.rpc("definir_permissoes_usuario", {
    p_user_id: userId,
    p_permissoes: linhas,
    p_company_id: null,
  });
  if (error) return { error: error.message };

  await logAudit({
    action: "UPDATE",
    entity: "usuario_permissoes",
    entityId: userId,
    newValue: { permissoesGlobais, empresas },
  });

  revalidatePath(`/admin/usuarios/${userId}`);
  return { success: true };
}

export async function removerAcessos(userId: string): Promise<{ error?: string; success?: boolean }> {
  await requireGerenciarUsuarios();
  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_permissoes_usuario", {
    p_user_id: userId,
    p_permissoes: [],
    p_company_id: null,
  });
  if (error) return { error: error.message };

  await logAudit({ action: "REMOVE_ALL", entity: "usuario_permissoes", entityId: userId });
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function suspenderUsuario(userId: string): Promise<{ error?: string; success?: boolean }> {
  await requireGerenciarUsuarios();
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  const { error } = await admin.from("profiles").update({ ativo: false }).eq("id", userId);
  if (error) return { error: error.message };

  await logAudit({ action: "SUSPEND", entity: "profiles", entityId: userId });
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function reativarUsuario(userId: string): Promise<{ error?: string; success?: boolean }> {
  await requireGerenciarUsuarios();
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  const { error } = await admin.from("profiles").update({ ativo: true }).eq("id", userId);
  if (error) return { error: error.message };

  await logAudit({ action: "REACTIVATE", entity: "profiles", entityId: userId });
  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/usuarios");
  return { success: true };
}

export async function reenviarConvite(email: string): Promise<{ error?: string; success?: boolean }> {
  await requireGerenciarUsuarios();
  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
  });
  if (error) return { error: "Não foi possível reenviar o convite." };
  return { success: true };
}

// Autoatendimento do cliente — convida alguém novo já escopado a uma única
// empresa. A RPC (via salvarPermissoesUsuarioEmpresa) garante que o
// chamador só pode conceder o que ele mesmo já tem naquela empresa.
export async function convidarUsuarioEmpresa(input: {
  companyId: string;
  email: string;
  fullName: string;
  permissoes: Permissao[];
}): Promise<{ error?: string; userId?: string }> {
  await requireUser();

  const parsed = z
    .object({
      email: z.string().trim().toLowerCase().email("E-mail inválido."),
      fullName: z.string().trim().min(2, "Informe o nome."),
    })
    .safeParse({ email: input.email, fullName: input.fullName });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { email, fullName } = parsed.data;

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
  });

  let userId = invited?.user?.id;
  if (inviteError) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (!existing) return { error: "Não foi possível convidar esse e-mail." };
    userId = existing.id;
  }
  if (!userId) return { error: "Não foi possível identificar o usuário convidado." };

  const resposta = await salvarPermissoesUsuarioEmpresa(userId, input.companyId, input.permissoes);
  if (resposta.error) return { error: resposta.error };
  return { userId };
}

// Autoatendimento do cliente — só mexe na empresa informada, e a RPC
// garante que só pode conceder o que o próprio chamador já tem ali.
export async function salvarPermissoesUsuarioEmpresa(
  userId: string,
  companyId: string,
  permissoes: Permissao[],
): Promise<{ error?: string; success?: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const linhas = expandirImplicacoes(permissoes).map((p) => ({
    permissao: p,
    company_id: companyId,
  }));
  const { error } = await supabase.rpc("definir_permissoes_usuario", {
    p_user_id: userId,
    p_permissoes: linhas,
    p_company_id: companyId,
  });
  if (error) return { error: error.message };

  await logAudit({
    companyId,
    action: "UPDATE",
    entity: "usuario_permissoes",
    entityId: userId,
    newValue: { permissoes },
  });

  revalidatePath(`/empresas/${companyId}/usuarios`);
  return { success: true };
}
