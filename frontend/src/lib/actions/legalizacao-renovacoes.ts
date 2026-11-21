"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireUser } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { get } from "@vercel/blob";
import { abrirRenovacaoCore } from "@/lib/legalizacao-renovacao-core";
import { gruposWhatsappDaEmpresa } from "@/lib/legalizacao-whatsapp";
import { enviarArquivo, enviarTexto, servicoDoContato } from "@/lib/digisac/client";
import { concluirFase } from "@/lib/actions/legalizacao-processos";
import { hojeSaoPaulo } from "@/app/legalizacao/processos/status";

function revalidarRenovacao(processoId?: string, companyId?: string | null) {
  if (processoId) revalidatePath(`/legalizacao/processos/${processoId}`);
  if (companyId) revalidatePath(`/legalizacao/empresas/${companyId}`);
  revalidatePath("/legalizacao/processos");
  revalidatePath("/legalizacao/renovacoes");
  revalidatePath("/legalizacao/licencas");
}

export async function abrirRenovacao(
  companyId: string,
  tipoId: string,
): Promise<{ processoId: string } | { error: string; processoExistenteId?: string }> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  if (!uuidLike.safeParse(companyId).success || !uuidLike.safeParse(tipoId).success) {
    return { error: "Dados inválidos." };
  }
  const supabase = await createClient();
  const resultado = await abrirRenovacaoCore(supabase, {
    companyId,
    tipoId,
    criadoPor: user.id,
    origem: "MANUAL",
    responsavelId: user.id,
  });
  if ("processoId" in resultado) revalidarRenovacao(resultado.processoId, companyId);
  return resultado;
}

const dadosRenovacaoSchema = z.object({
  processoId: uuidLike,
  protocoloNumero: z.string().trim().max(120).optional(),
  protocoloData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  guiaValor: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? Number(v.replace(/\./g, "").replace(",", ".")) : null))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0), "Valor da guia inválido."),
  guiaVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type DadosRenovacaoState = { error?: string; success?: boolean } | undefined;

export async function salvarDadosRenovacao(
  _prev: DadosRenovacaoState,
  formData: FormData,
): Promise<DadosRenovacaoState> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const parsed = dadosRenovacaoSchema.safeParse({
    processoId: formData.get("processoId"),
    protocoloNumero: formData.get("protocoloNumero") || undefined,
    protocoloData: formData.get("protocoloData") || undefined,
    guiaValor: formData.get("guiaValor") || undefined,
    guiaVencimento: formData.get("guiaVencimento") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: antes } = await supabase
    .from("legalizacao_processos")
    .select("company_id, protocolo_numero, protocolo_data, guia_valor, guia_vencimento")
    .eq("id", v.processoId)
    .single();
  if (!antes) return { error: "Processo não encontrado." };

  const novo = {
    protocolo_numero: v.protocoloNumero || null,
    protocolo_data: v.protocoloData || null,
    guia_valor: v.guiaValor,
    guia_vencimento: v.guiaVencimento || null,
  };
  const { error } = await supabase.from("legalizacao_processos").update(novo).eq("id", v.processoId);
  if (error) return { error: "Não foi possível salvar." };

  const mudancas: string[] = [];
  if ((antes.protocolo_numero ?? null) !== novo.protocolo_numero && novo.protocolo_numero)
    mudancas.push(`protocolo nº ${novo.protocolo_numero}`);
  if ((antes.protocolo_data ?? null) !== novo.protocolo_data && novo.protocolo_data)
    mudancas.push(`protocolado em ${novo.protocolo_data.split("-").reverse().join("/")}`);
  if (Number(antes.guia_valor ?? NaN) !== Number(novo.guia_valor ?? NaN) && novo.guia_valor != null)
    mudancas.push(`guia de R$ ${novo.guia_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  if ((antes.guia_vencimento ?? null) !== novo.guia_vencimento && novo.guia_vencimento)
    mudancas.push(`guia vence em ${novo.guia_vencimento.split("-").reverse().join("/")}`);
  if (mudancas.length > 0) {
    await supabase.from("legalizacao_processo_atividade").insert({
      processo_id: v.processoId,
      tipo: "ALTERACAO_PROCESSO",
      autor_id: user.id,
      corpo: `Registrou ${mudancas.join(", ")}.`,
    });
  }

  revalidarRenovacao(v.processoId, antes.company_id);
  return { success: true };
}

export async function marcarRequisito(requisitoId: string, processoId: string, recebido: boolean) {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const supabase = await createClient();
  await supabase
    .from("legalizacao_processo_requisitos")
    .update(recebido ? { recebido_em: new Date().toISOString(), recebido_por: user.id } : { recebido_em: null, recebido_por: null })
    .eq("id", requisitoId)
    .eq("processo_id", processoId);
  revalidatePath(`/legalizacao/processos/${processoId}`);
  revalidatePath("/legalizacao/renovacoes");
}

export async function adicionarRequisito(processoId: string, item: string) {
  await requirePermissao("legalizacao.editar");
  const texto = item.trim();
  if (texto.length < 2) return;
  const supabase = await createClient();
  await supabase.from("legalizacao_processo_requisitos").insert({ processo_id: processoId, item: texto, ordem: 1000 });
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

export async function removerRequisito(requisitoId: string, processoId: string) {
  await requirePermissao("legalizacao.editar");
  const supabase = await createClient();
  await supabase.from("legalizacao_processo_requisitos").delete().eq("id", requisitoId).eq("processo_id", processoId);
  revalidatePath(`/legalizacao/processos/${processoId}`);
}

const envioWhatsappSchema = z.object({
  processoId: uuidLike,
  contactId: z.string().trim().min(1, "Escolha o grupo do WhatsApp."),
  texto: z.string().trim().min(5, "Escreva a mensagem.").max(4000),
  anexoId: uuidLike.optional(),
  concluirFase: z.string().optional(), // nome da fase a concluir junto
});

export type EnvioWhatsappState = { error?: string; success?: string } | undefined;

// Envia a mensagem (com a guia anexada, se escolhida) pelo Digisac ao grupo
// do cliente vinculado à empresa, registra na atividade do processo e, se
// pedido, conclui a fase correspondente ("Guia enviada ao cliente").
export async function enviarWhatsappRenovacao(
  _prev: EnvioWhatsappState,
  formData: FormData,
): Promise<EnvioWhatsappState> {
  await requirePermissao("legalizacao.editar");
  const user = await requireUser();
  const parsed = envioWhatsappSchema.safeParse({
    processoId: formData.get("processoId"),
    contactId: formData.get("contactId"),
    texto: formData.get("texto"),
    anexoId: formData.get("anexoId") || undefined,
    concluirFase: formData.get("concluirFase") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;

  const supabase = await createClient();
  const { data: processo } = await supabase
    .from("legalizacao_processos")
    .select("company_id, tipo_processo")
    .eq("id", v.processoId)
    .single();
  if (!processo?.company_id || processo.tipo_processo !== "RENOVACAO") return { error: "Processo não encontrado." };

  const grupo = (await gruposWhatsappDaEmpresa(processo.company_id)).find((g) => g.contactId === v.contactId);
  if (!grupo) return { error: "Esse grupo não está vinculado a esta empresa." };

  let arquivo: { base64: string; mimetype: string; nome: string } | null = null;
  if (v.anexoId) {
    const { data: anexo } = await supabase
      .from("legalizacao_processo_anexos")
      .select("blob_pathname, nome_arquivo")
      .eq("id", v.anexoId)
      .eq("processo_id", v.processoId)
      .maybeSingle();
    if (!anexo) return { error: "Anexo não encontrado neste processo." };
    const blob = await get(anexo.blob_pathname, { access: "private" }).catch(() => null);
    if (!blob || blob.statusCode !== 200) return { error: "Não foi possível ler o arquivo anexado." };
    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    if (buffer.byteLength > 20 * 1024 * 1024) return { error: "Arquivo maior que 20 MB." };
    arquivo = { base64: buffer.toString("base64"), mimetype: blob.blob.contentType || "application/pdf", nome: anexo.nome_arquivo };
  }

  try {
    const serviceId = await servicoDoContato(v.contactId).catch(() => null);
    if (arquivo) await enviarArquivo({ contactId: v.contactId, serviceId, texto: v.texto, arquivo });
    else await enviarTexto({ contactId: v.contactId, serviceId, texto: v.texto });
  } catch (e) {
    console.error("[renovacao-whatsapp] falha ao enviar:", e instanceof Error ? e.message : e);
    return { error: "Não foi possível enviar pelo WhatsApp agora. Tente de novo em instantes." };
  }

  await supabase.from("legalizacao_processo_atividade").insert({
    processo_id: v.processoId,
    tipo: "COMENTARIO",
    autor_id: user.id,
    corpo: `Enviou pelo WhatsApp (${grupo.nome})${arquivo ? ` com o arquivo "${arquivo.nome}"` : ""}:\n\n${v.texto}`,
  });

  if (v.concluirFase) {
    const { data: fase } = await supabase
      .from("legalizacao_processo_fases")
      .select("id, data_conclusao")
      .eq("processo_id", v.processoId)
      .eq("nome", v.concluirFase)
      .maybeSingle();
    if (fase && !fase.data_conclusao) {
      await concluirFase(fase.id, v.processoId, hojeSaoPaulo());
    }
  }

  revalidarRenovacao(v.processoId, processo.company_id);
  return { success: `Enviado para ${grupo.nome}.` };
}
