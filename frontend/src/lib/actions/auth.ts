"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: boolean } | undefined;

const loginSchema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido."),
  password: z.string().min(1, "Informe a senha."),
});

export async function login(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const emailSchema = z.string().trim().min(1, "Informe o e-mail.").email("E-mail inválido.");

export async function requestPasswordReset(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "E-mail inválido." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
  });

  // Sempre "sucesso" — não confirmamos ao remetente se o e-mail existe ou não.
  return { success: true };
}

const TIPOS_LINK: EmailOtpType[] = ["invite", "recovery", "signup", "magiclink", "email_change", "email"];

// Chamado pelo botão da página /auth/confirm — só aqui o token do e-mail é
// gasto, para que scanners de e-mail que abrem o link não o invalidem.
export async function confirmarLinkEmail(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tokenHash = formData.get("token_hash");
  const type = formData.get("type");
  const next = formData.get("next");

  if (
    typeof tokenHash !== "string" ||
    !tokenHash ||
    typeof type !== "string" ||
    !TIPOS_LINK.includes(type as EmailOtpType)
  ) {
    redirect("/login?erro=link-invalido");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: tokenHash,
  });
  if (error) redirect("/login?erro=link-invalido");

  const destino =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/redefinir-senha";
  redirect(destino);
}

const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export async function updatePassword(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    return { error: "Não foi possível atualizar a senha. Peça um novo link." };
  }

  redirect("/");
}
