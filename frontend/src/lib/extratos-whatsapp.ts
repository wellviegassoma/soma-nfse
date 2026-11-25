import "server-only";
import { put } from "@vercel/blob";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarArquivo, buscarMensagem } from "@/lib/digisac/client";
import { mesAnteriorBrasilia, mesCorrenteBrasilia } from "@/lib/competencia";
import { lerBuffer, processarArquivo } from "@/lib/extratos-arquivos";

// Extratos que o cliente manda no grupo do WhatsApp (Digisac). O webhook
// avisa de todo documento/imagem; aqui:
//  1. rebusca a mensagem na API (o webhook não é assinado) e confere que é do
//     cliente, com arquivo, num grupo vinculado a empresa com controle de extrato;
//  2. lê o arquivo em memória (OFX ou IA) — se não for extrato, descarta sem
//     guardar nada (foto, nota, comprovante…);
//  3. se for, copia para o Blob privado, registra em extrato_arquivos
//     (origem WHATSAPP) e processa como um upload: marca o mês como recebido
//     ou deixa na fila. Só registro interno — nada é respondido ao cliente.

export const TIPOS_ARQUIVO_WHATSAPP = new Set(["document", "image"]);

type Resultado = { motivo: string; arquivoId?: string };

function mimeDe(nome: string, mimetype: string | null): string {
  if (/\.ofx$/i.test(nome)) return "application/x-ofx";
  if (mimetype) return mimetype.split(";")[0].trim().toLowerCase();
  if (/\.pdf$/i.test(nome)) return "application/pdf";
  return "";
}

export async function receberExtratoWhatsapp(messageId: string): Promise<Resultado> {
  const db = createAdminClient();

  const { data: ja } = await db.from("extrato_arquivos").select("id").eq("origem_mensagem_id", messageId).maybeSingle();
  if (ja) return { motivo: "já processada", arquivoId: ja.id as string };

  const msg = await buscarMensagem(messageId, { comArquivo: true });
  if (!msg || msg.isComment || msg.isFromMe || !TIPOS_ARQUIVO_WHATSAPP.has(msg.type) || !msg.file || msg.data?.softRevoked) {
    return { motivo: "não é arquivo do cliente" };
  }

  const nome = msg.file.name || `arquivo.${msg.file.extension ?? "bin"}`;
  const mime = mimeDe(nome, msg.file.mimetype);
  const ofx = mime === "application/x-ofx";
  const pdf = mime === "application/pdf";
  const imagem = /^image\/(jpeg|png|webp)$/.test(mime);
  if (!ofx && !pdf && !imagem) return { motivo: "formato que não é extrato" };

  const { data: vinculos } = await db
    .from("pedido_nota_vinculos")
    .select("company_id")
    .eq("origem", "DIGISAC")
    .eq("origem_contact_id", msg.contactId);
  const companyIds = [...new Set((vinculos ?? []).map((v) => v.company_id as string))];
  if (!companyIds.length) return { motivo: "contato sem empresa vinculada" };

  const { data: contas } = await db
    .from("extrato_contas_bancarias")
    .select("id, company_id, banco, agencia, conta")
    .in("company_id", companyIds)
    .eq("ativo", true);
  if (!contas?.length) return { motivo: "empresa sem conta bancária cadastrada" };

  // Foto é o que mais circula nos grupos: só gasta IA com imagem se ainda
  // falta extrato (mês anterior ou atual) em alguma conta.
  if (imagem) {
    const { data: recebidos } = await db
      .from("extratos_mensais")
      .select("conta_id")
      .in("conta_id", contas.map((c) => c.id as string))
      .in("competencia", [mesAnteriorBrasilia(), mesCorrenteBrasilia()])
      .eq("entregue", true);
    const ok = new Set((recebidos ?? []).map((r) => r.conta_id as string));
    if (contas.every((c) => ok.has(c.id as string))) return { motivo: "imagem sem extrato pendente" };
  }

  const unica = companyIds.length === 1 ? companyIds[0] : null;
  let empresaNome: string | null = null;
  if (unica) {
    const { data } = await db.from("companies").select("legal_name, trade_name").eq("id", unica).single();
    empresaNome = data ? ((data.trade_name || data.legal_name) as string) : null;
  }

  const buf = await baixarArquivo(msg.file);
  const lida = await lerBuffer(buf, nome, mime, {
    empresa: empresaNome,
    contas: contas
      .filter((c) => !unica || c.company_id === unica)
      .map((c) => ({ banco: c.banco as string, agencia: c.agencia as string, conta: c.conta as string })),
  });
  if (!lida.leitura.ehExtrato) {
    return { motivo: `não é extrato (${lida.leitura.tipoDocumento ?? "documento"})` };
  }

  const seguro = nome.replace(/[^\w.\-]+/g, "_").slice(-120);
  const blob = await put(`extratos/whatsapp/${unica ?? "grupo"}/${Date.now()}-${seguro}`, buf, {
    access: "private",
    contentType: mime,
    addRandomSuffix: true,
  });
  const { data: arq, error } = await db
    .from("extrato_arquivos")
    .insert({
      company_id: unica,
      blob_url: blob.url,
      blob_pathname: blob.pathname,
      nome_arquivo: nome,
      mime,
      tamanho: buf.length,
      origem: "WHATSAPP",
      origem_mensagem_id: messageId,
    })
    .select("id")
    .single();
  if (error || !arq) {
    // Corrida com outra entrega do mesmo webhook (índice único).
    return { motivo: "já registrada" };
  }

  const r = await processarArquivo(db, arq.id as string, { companyId: unica, leituraPronta: lida, empresasPermitidas: companyIds });
  return { motivo: r.situacao === "IDENTIFICADO" ? `identificado ${r.competencias.join(",")}` : "fila", arquivoId: arq.id as string };
}
