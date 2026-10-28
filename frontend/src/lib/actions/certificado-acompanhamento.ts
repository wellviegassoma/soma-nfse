"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isSomaStaff, requireUser, temPermissao } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { ETAPAS } from "@/lib/certificado-acompanhamento";

const schema = z.object({
  companyIds: z.array(uuidLike).min(1, "Selecione ao menos uma empresa.").max(500),
  status: z.enum(ETAPAS),
  // Ausente = mantém o que já estava (ação em lote só troca a etapa).
  observacao: z.string().trim().max(2000).optional(),
  proximoContato: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
    .or(z.literal(""))
    .optional(),
});

export type AtualizarAcompanhamentoInput = z.input<typeof schema>;

/**
 * Grava a etapa do acompanhamento de uma ou várias empresas e registra no
 * histórico. O vencimento de referência vem do certificado atual no banco
 * (não do cliente) — é ele que diz a qual ciclo a etapa pertence.
 */
export async function atualizarAcompanhamentoCertificado(
  input: AtualizarAcompanhamentoInput,
): Promise<{ error: string } | { ok: true; atualizadas: number }> {
  const user = await requireUser();
  if (!(await isSomaStaff()) && !(await temPermissao("certificados.ver"))) {
    return { error: "Sem permissão para essa ação." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { companyIds, status, observacao, proximoContato } = parsed.data;

  const supabase = await createClient();
  const [{ data: certificados, error: errCert }, { data: atuais, error: errAtuais }] = await Promise.all([
    supabase.from("certificates").select("company_id, expires_at").in("company_id", companyIds),
    supabase
      .from("certificado_acompanhamentos")
      .select("company_id, referente_vencimento, observacao, proximo_contato")
      .in("company_id", companyIds),
  ]);
  if (errCert || errAtuais) return { error: "Não foi possível ler os certificados." };

  const vencimentoPorEmpresa = new Map((certificados ?? []).map((c) => [c.company_id as string, c.expires_at as string]));
  const atualPorEmpresa = new Map((atuais ?? []).map((a) => [a.company_id as string, a]));
  const agora = new Date().toISOString();

  const linhas = companyIds.map((companyId) => {
    const referente = vencimentoPorEmpresa.get(companyId) ?? null;
    const atual = atualPorEmpresa.get(companyId);
    // Observação/próximo contato de outro ciclo não carregam pro novo.
    const mesmoCiclo =
      atual &&
      (atual.referente_vencimento && referente
        ? new Date(atual.referente_vencimento).getTime() === new Date(referente).getTime()
        : atual.referente_vencimento === referente);
    return {
      company_id: companyId,
      status,
      referente_vencimento: referente,
      observacao: observacao !== undefined ? observacao || null : mesmoCiclo ? atual.observacao : null,
      proximo_contato:
        proximoContato !== undefined ? proximoContato || null : mesmoCiclo ? atual.proximo_contato : null,
    };
  });

  const { error } = await supabase
    .from("certificado_acompanhamentos")
    .upsert(
      linhas.map((l) => ({ ...l, atualizado_por: user.id, atualizado_em: agora })),
      { onConflict: "company_id" },
    );
  if (error) return { error: "Não foi possível salvar o acompanhamento." };

  const { error: errEventos } = await supabase
    .from("certificado_acompanhamento_eventos")
    .insert(linhas.map((l) => ({ ...l, criado_por: user.id, criado_em: agora })));
  if (errEventos) return { error: "Etapa salva, mas o histórico não foi registrado." };

  revalidatePath("/admin/certificados");
  for (const id of companyIds) revalidatePath(`/admin/empresas/${id}/certificado`);
  return { ok: true, atualizadas: companyIds.length };
}
