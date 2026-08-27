"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";

export async function listarConversas() {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_ia_conversas")
    .select("id, titulo, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function criarConversa() {
  await requireSomaStaff();
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_ia_conversas")
    .insert({ user_id: user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error("Não foi possível criar a conversa.");
  revalidatePath("/admin/chat");
  return data.id;
}

export async function buscarMensagens(conversaId: string) {
  await requireSomaStaff();
  if (!uuidLike.safeParse(conversaId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_ia_mensagens")
    .select("id, role, content, created_at")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function apagarConversa(conversaId: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("chat_ia_conversas").delete().eq("id", conversaId);
  revalidatePath("/admin/chat");
}

export async function renomearConversa(conversaId: string, titulo: string) {
  await requireSomaStaff();
  const supabase = await createClient();
  await supabase.from("chat_ia_conversas").update({ titulo }).eq("id", conversaId);
  revalidatePath("/admin/chat");
}
