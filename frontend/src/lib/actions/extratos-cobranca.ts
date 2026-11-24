"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { carregarCobranca, gruposPorEmpresa } from "@/lib/extratos-cobranca";
import { enviarTexto, servicoDoContato } from "@/lib/digisac/client";

const envioSchema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  incluirAnteriores: z.boolean(),
  forcar: z.boolean().default(false), // reenviar mesmo já cobrada hoje
  envios: z
    .array(
      z.object({
        companyId: uuidLike,
        contactId: z.string().min(1).max(200),
        texto: z.string().trim().min(10).max(4000),
      }),
    )
    .min(1)
    .max(150),
});

export type ResultadoEnvio = { companyId: string; ok: boolean; motivo?: string };

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export async function enviarCobrancasExtratos(
  input: z.input<typeof envioSchema>,
): Promise<{ error?: string; resultados?: ResultadoEnvio[] }> {
  await requirePermissao("extratos.editar");
  const user = await requireUser();
  const parsed = envioSchema.safeParse(input);
  if (!parsed.success) return { error: "Dados inválidos." };
  const v = parsed.data;

  const ids = v.envios.map((e) => e.companyId);
  // Recalcula as pendências no servidor: é o que vai para o histórico.
  const [pendencias, grupos] = await Promise.all([
    carregarCobranca({ responsavelId: null, competencia: v.competencia, incluirAnteriores: v.incluirAnteriores, companyIds: ids }),
    gruposPorEmpresa(ids),
  ]);
  const porEmpresa = new Map(pendencias.map((p) => [p.id, p]));
  const hoje = hojeSP();

  const supabase = await createClient();
  const resultados: ResultadoEnvio[] = [];
  for (const envio of v.envios) {
    const emp = porEmpresa.get(envio.companyId);
    if (!emp) {
      resultados.push({ companyId: envio.companyId, ok: false, motivo: "Nada pendente (já entregue ou empresa fora da carteira)." });
      continue;
    }
    const grupo = (grupos.get(envio.companyId) ?? []).find((g) => g.contactId === envio.contactId);
    if (!grupo) {
      resultados.push({ companyId: envio.companyId, ok: false, motivo: "Grupo do WhatsApp não é desta empresa." });
      continue;
    }
    if (!v.forcar && emp.ultimaCobranca && diaSP(emp.ultimaCobranca.em) === hoje) {
      resultados.push({ companyId: envio.companyId, ok: false, motivo: "Já cobrada hoje." });
      continue;
    }
    try {
      const serviceId = await servicoDoContato(grupo.contactId).catch(() => null);
      await enviarTexto({ contactId: grupo.contactId, serviceId, texto: envio.texto });
    } catch (e) {
      console.error("[extratos-cobranca] falha ao enviar:", e instanceof Error ? e.message : e);
      resultados.push({ companyId: envio.companyId, ok: false, motivo: "Falha no envio pelo Digisac." });
      continue;
    }
    const { error } = await supabase.from("extrato_cobrancas").insert({
      company_id: envio.companyId,
      competencia: v.competencia,
      itens: emp.itens,
      contact_id: grupo.contactId,
      grupo_nome: grupo.nome,
      texto: envio.texto,
      enviado_por: user.id,
    });
    if (error) console.error("[extratos-cobranca] enviada mas não registrada:", error.message);
    resultados.push({ companyId: envio.companyId, ok: true, motivo: error ? "Enviada, mas o histórico não foi gravado." : undefined });
  }

  revalidatePath("/extratos/cobranca");
  return { resultados };
}

function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}
