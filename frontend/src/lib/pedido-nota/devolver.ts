import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarArquivo, enviarComentario } from "@/lib/digisac/client";

// Fase 4 do pedido de nota (docs/pedido-nota-ia.md): depois da emissão,
// manda o DANFSe (PDF) e o XML para o cliente no mesmo contato do Digisac,
// e um comentário interno para o atendente.
//
// Envio ao cliente só com DIGISAC_ENVIAR_NOTA_CLIENTE=1 — é mensagem de
// verdade no WhatsApp do cliente. Desligado, o atendente recebe só o
// comentário (se DIGISAC_RESPONDER_COMENTARIOS=1) e manda a nota ele mesmo.

async function gerarDanfse(xml: string): Promise<Buffer> {
  const r = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/danfse`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "" },
    body: JSON.stringify({ xml_nfse: xml, cancelada: false }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`DANFSe → HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

export async function devolverNotaAoCliente(itemId: string): Promise<{ enviado: boolean; motivo: string }> {
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("pedido_nota_itens")
    .select("id, valor, dps_id, pedido:pedidos_nota(origem_contact_id, origem_service_id)")
    .eq("id", itemId)
    .single();
  const pedido = Array.isArray(item?.pedido) ? item?.pedido[0] : item?.pedido;
  if (!item?.dps_id || !pedido) return { enviado: false, motivo: "item sem nota emitida" };

  const { data: nfse } = await admin.from("nfse").select("xml_nfse, access_key").eq("dps_id", item.dps_id).maybeSingle();
  if (!nfse?.xml_nfse) return { enviado: false, motivo: "NFS-e sem XML" };

  const numero = /<nNFSe>(\d+)<\/nNFSe>/.exec(nfse.xml_nfse)?.[1] ?? null;
  const valor = Number(item.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rotulo = numero ? `nº ${numero}` : "";
  const contactId = pedido.origem_contact_id as string;

  const comentar = async (t: string) => {
    if (process.env.DIGISAC_RESPONDER_COMENTARIOS !== "1") return;
    await enviarComentario(contactId, t).catch((e) =>
      console.error("[pedido-nota] falha ao comentar:", e instanceof Error ? e.message : e),
    );
  };

  if (process.env.DIGISAC_ENVIAR_NOTA_CLIENTE !== "1") {
    await comentar(`✅ SOMA Gestão: nota ${rotulo} de ${valor} emitida. Envio automático ao cliente desligado: mande o PDF pelo sistema.`);
    return { enviado: false, motivo: "envio ao cliente desligado" };
  }

  try {
    const pdf = await gerarDanfse(nfse.xml_nfse);
    const nome = `nfse-${numero ?? nfse.access_key ?? item.dps_id}`;
    await enviarArquivo({
      contactId,
      serviceId: (pedido.origem_service_id as string | null) ?? null,
      texto: `Olá! Segue a nota fiscal ${rotulo} no valor de ${valor}.`,
      arquivo: { base64: pdf.toString("base64"), mimetype: "application/pdf", nome: `${nome}.pdf` },
    });
    await enviarArquivo({
      contactId,
      serviceId: (pedido.origem_service_id as string | null) ?? null,
      texto: "XML da nota fiscal.",
      arquivo: { base64: Buffer.from(nfse.xml_nfse, "utf8").toString("base64"), mimetype: "application/xml", nome: `${nome}.xml` },
    });
    await comentar(`✅ SOMA Gestão: nota ${rotulo} de ${valor} emitida e enviada ao cliente (PDF + XML).`);
    return { enviado: true, motivo: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha";
    await comentar(`⚠️ SOMA Gestão: nota ${rotulo} de ${valor} emitida, mas não consegui enviar ao cliente (${msg}). Mande o PDF pelo sistema.`);
    return { enviado: false, motivo: msg };
  }
}
