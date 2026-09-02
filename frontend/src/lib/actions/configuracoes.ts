"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isCpfValido } from "@/lib/formatters";
import type { ActionState } from "@/lib/actions/auth";

const CONFIGURACAO_ID = "00000000-0000-0000-0000-000000000001";

export type ContadorResponsavel = {
  cpf: string | null;
  crc_uf: string | null;
  crc_numero: string | null;
  telefone_ddd: string | null;
  telefone_numero: string | null;
  email: string | null;
};

export async function buscarContadorResponsavel(): Promise<ContadorResponsavel | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("configuracao_contador_responsavel")
    .select("cpf, crc_uf, crc_numero, telefone_ddd, telefone_numero, email")
    .eq("id", CONFIGURACAO_ID)
    .maybeSingle();
  return data;
}

const updateContadorResponsavelSchema = z.object({
  cpf: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => isCpfValido(v), "CPF inválido."),
  crcUf: z.string().length(2, "UF inválida."),
  crcNumero: z.string().min(1, "Número do CRC é obrigatório."),
  telefoneDdd: z.string().regex(/^\d{2}$/, "DDD inválido."),
  telefoneNumero: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 8 || v.length === 9, "Telefone inválido."),
  email: z.string().email("E-mail inválido."),
});

// Só SUPER_ADMIN pode mexer (ver requireSuperAdmin) — dado único,
// compartilhado por toda declaração do MIT de qualquer empresa Lucro
// Presumido, não algo por cliente. RLS de configuracao_contador_responsavel
// reforça a mesma regra no banco (defesa em profundidade).
export async function updateContadorResponsavel(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = updateContadorResponsavelSchema.safeParse({
    cpf: formData.get("cpf"),
    crcUf: formData.get("crcUf"),
    crcNumero: formData.get("crcNumero"),
    telefoneDdd: formData.get("telefoneDdd"),
    telefoneNumero: formData.get("telefoneNumero"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("configuracao_contador_responsavel")
    .select("cpf, crc_uf, crc_numero, telefone_ddd, telefone_numero, email")
    .eq("id", CONFIGURACAO_ID)
    .maybeSingle();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const newValue = {
    id: CONFIGURACAO_ID,
    cpf: parsed.data.cpf,
    crc_uf: parsed.data.crcUf.toUpperCase(),
    crc_numero: parsed.data.crcNumero,
    telefone_ddd: parsed.data.telefoneDdd,
    telefone_numero: parsed.data.telefoneNumero,
    email: parsed.data.email,
    updated_by: user?.id ?? null,
  };

  const { error } = await supabase.from("configuracao_contador_responsavel").upsert(newValue);
  if (error) return { error: "Não foi possível salvar." };

  // Nunca loga o CPF em `oldValue`/`newValue` do audit por extenso — não é
  // segredo, mas dado pessoal sem necessidade de ficar espalhado em log;
  // o que importa auditar é QUEM mudou e QUANDO, não o valor em si.
  await logAudit({
    action: "UPDATE",
    entity: "configuracao_contador_responsavel",
    entityId: CONFIGURACAO_ID,
    oldValue: before ? { configurado: true } : { configurado: false },
    newValue: { configurado: true },
  });

  revalidatePath("/admin/configuracoes/contador-responsavel");
  return { success: true };
}
