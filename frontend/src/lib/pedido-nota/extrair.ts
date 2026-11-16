import "server-only";
import { get } from "@vercel/blob";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeBrasilia } from "@/lib/competencia";
import { lerPlanilhaLote } from "@/lib/lote-notas";
import {
  MODELO_PADRAO,
  chamarIA,
  posProcessar,
  type AnexoEntrada,
  type EntradaExtracao,
  type HistoricoTomador,
  type MensagemCliente,
} from "@/lib/pedido-nota/extrair-core";

// Fase 2 do pedido de nota (docs/pedido-nota-ia.md): lê o pedido gravado na
// Fase 1, monta a entrada da IA com o catálogo da empresa, grava os rascunhos
// em pedido_nota_itens e deixa o pedido AGUARDANDO_APROVACAO.
//
// Só roda com company_id definido — sem empresa não há catálogo de serviços
// nem de tomadores. Telefone sem empresa / com várias: o painel (Fase 3)
// escolhe a empresa e chama extrairPedido de novo.

const MAX_TOMADORES = 400;
const MAX_BYTES_ARQUIVOS = 18 * 1024 * 1024;

type MensagemGravada = { id: string; timestamp: string; tipo: string; texto: string | null; anexo_index: number | null };
type AnexoGravado = { message_id: string; pathname: string; nome: string | null; mimetype: string | null; bytes: number };

async function lerBlob(pathname: string): Promise<Buffer> {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error("anexo não encontrado no Blob");
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

async function prepararAnexo(a: AnexoGravado, orcamento: { bytes: number }): Promise<AnexoEntrada> {
  const mime = (a.mimetype ?? "").toLowerCase();
  const nome = a.nome;
  if (mime.startsWith("audio/")) return { tipo: "audio", transcricao: null, nome };
  const planilha =
    mime.includes("spreadsheet") || mime.includes("excel") || /\.(xlsx|xls)$/i.test(nome ?? "") || a.pathname.endsWith(".xlsx");
  if (planilha) {
    const buf = await lerBlob(a.pathname);
    const lida = await lerPlanilhaLote(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    if ("error" in lida) return { tipo: "outro", nome, mimetype: a.mimetype };
    return { tipo: "planilha", linhas: lida.linhas, nome };
  }
  const ehImagem = mime.startsWith("image/");
  const ehPdf = mime === "application/pdf";
  if ((ehImagem || ehPdf) && orcamento.bytes + a.bytes <= MAX_BYTES_ARQUIVOS) {
    orcamento.bytes += a.bytes;
    const dados = await lerBlob(a.pathname);
    return ehPdf ? { tipo: "pdf", dados, nome } : { tipo: "imagem", mediaType: mime, dados, nome };
  }
  return { tipo: "outro", nome, mimetype: a.mimetype };
}

export async function extrairPedido(pedidoId: string): Promise<{ itens: number; motivo: string }> {
  const admin = createAdminClient();

  const { data: pedido } = await admin
    .from("pedidos_nota")
    .select("id, status, company_id, dica_atendente, mensagens, anexos")
    .eq("id", pedidoId)
    .maybeSingle();
  if (!pedido) return { itens: 0, motivo: "pedido não encontrado" };
  if (!pedido.company_id) return { itens: 0, motivo: "aguardando escolha da empresa" };
  if (!["RECEBIDO", "ERRO", "AGUARDANDO_APROVACAO"].includes(pedido.status)) {
    return { itens: 0, motivo: `status ${pedido.status} não permite extrair` };
  }

  // Trava otimista: só um processo extrai por vez.
  const { data: travado } = await admin
    .from("pedidos_nota")
    .update({ status: "EXTRAINDO", erro: null })
    .eq("id", pedidoId)
    .eq("status", pedido.status)
    .select("id")
    .maybeSingle();
  if (!travado) return { itens: 0, motivo: "outro processo já está extraindo" };

  try {
    const companyId = pedido.company_id as string;
    const hoje = hojeBrasilia();

    const [empresaRes, servicosRes, tomadoresRes, notasRes] = await Promise.all([
      admin.from("companies").select("legal_name, trade_name, tax_regime, allow_retroactive_emission").eq("id", companyId).single(),
      admin.from("services").select("id, name, description").eq("company_id", companyId).eq("active", true).order("name"),
      admin.from("customers").select("id, name, cpf_cnpj").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(MAX_TOMADORES),
      admin
        .from("dps")
        .select("customer_id, valor, descricao, data_competencia, created_at, customer:customers(name)")
        .eq("company_id", companyId)
        .eq("status", "ACCEPTED")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    const empresa = empresaRes.data;
    if (!empresa) throw new Error("empresa não encontrada");

    type NotaDb = { customer_id: string; valor: number | string; descricao: string | null; data_competencia: string | null; created_at: string; customer: { name: string } | { name: string }[] | null };
    const notas = (notasRes.data ?? []) as NotaDb[];
    const nomeDe = (c: NotaDb["customer"]) => (Array.isArray(c) ? c[0]?.name : c?.name) ?? "?";

    // Tomadores: os das últimas notas primeiro (mais prováveis), depois o resto.
    const tomadoresTodos = (tomadoresRes.data ?? []).map((t) => ({ id: t.id as string, nome: t.name as string, documento: (t.cpf_cnpj as string | null) ?? null }));
    const idsRecentes = new Set(notas.map((n) => n.customer_id));
    const tomadores = [...tomadoresTodos.filter((t) => idsRecentes.has(t.id)), ...tomadoresTodos.filter((t) => !idsRecentes.has(t.id))];

    const anexosGravados = (pedido.anexos ?? []) as AnexoGravado[];
    const orcamento = { bytes: 0 };
    const anexosPreparados: (AnexoEntrada | null)[] = [];
    for (const a of anexosGravados) {
      try {
        anexosPreparados.push(await prepararAnexo(a, orcamento));
      } catch {
        anexosPreparados.push({ tipo: "outro", nome: a.nome, mimetype: a.mimetype });
      }
    }

    const mensagens: MensagemCliente[] = ((pedido.mensagens ?? []) as MensagemGravada[]).map((m) => ({
      timestamp: m.timestamp,
      tipo: m.tipo,
      texto: m.texto,
      anexo: m.anexo_index != null ? (anexosPreparados[m.anexo_index] ?? null) : null,
    }));

    const entrada: EntradaExtracao = {
      empresa: { nome: (empresa.trade_name as string | null) || (empresa.legal_name as string), regime: (empresa.tax_regime as string | null) ?? null },
      hojeBrasilia: hoje,
      servicos: (servicosRes.data ?? []).map((s) => ({ id: s.id as string, nome: s.name as string, descricao: (s.description as string | null) ?? null })),
      tomadores,
      ultimasNotas: notas.slice(0, 15).map((n) => ({
        tomadorId: n.customer_id,
        tomadorNome: nomeDe(n.customer),
        valor: Number(n.valor),
        descricao: n.descricao ?? "",
        data: n.data_competencia ?? n.created_at.slice(0, 10),
      })),
      dicaAtendente: (pedido.dica_atendente as string | null) ?? null,
      mensagens,
    };

    const ia = await chamarIA(entrada, process.env.PEDIDO_NOTA_MODELO || MODELO_PADRAO);

    // Histórico por tomador para os alertas (média e duplicidade 7 dias).
    const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const historico = (customerId: string): HistoricoTomador | undefined => {
      const doTomador = notas.filter((n) => n.customer_id === customerId);
      if (!doTomador.length) return undefined;
      return {
        valores: doTomador.slice(0, 10).map((n) => Number(n.valor)),
        ultimos7Dias: doTomador.filter((n) => n.created_at >= seteDiasAtras).map((n) => ({ valor: Number(n.valor), data: n.created_at.slice(0, 10) })),
      };
    };
    const temAudioSemTranscricao = anexosPreparados.some((a) => a?.tipo === "audio" && !a.transcricao);

    const itensFinais = ia.resposta.eh_pedido_de_nota
      ? ia.resposta.itens.map((it) =>
          posProcessar(it, {
            servicos: entrada.servicos,
            tomadores,
            hojeBrasilia: hoje,
            permiteRetroativa: Boolean(empresa.allow_retroactive_emission),
            historico,
            temAudioSemTranscricao,
          }),
        )
      : [];

    // Reextração substitui os rascunhos anteriores ainda não aprovados.
    await admin.from("pedido_nota_itens").delete().eq("pedido_id", pedidoId).eq("status", "RASCUNHO");
    if (itensFinais.length) {
      const { error } = await admin.from("pedido_nota_itens").insert(
        itensFinais.map((it, i) => ({
          pedido_id: pedidoId,
          ordem: i,
          status: "RASCUNHO",
          customer_id: it.customer_id,
          tomador_documento: it.tomador_documento,
          tomador_nome: it.tomador_nome,
          service_id: it.service_id,
          valor: it.valor,
          descricao: it.descricao,
          competencia: it.competencia,
          iss_retido: it.iss_retido,
          confianca: it.confianca,
          alertas: it.alertas,
          trecho_origem: it.trecho_origem,
          pergunta_ao_cliente: i === 0 ? ia.resposta.pergunta_ao_cliente : null,
        })),
      );
      if (error) throw new Error(`falha ao gravar itens: ${error.message}`);
    }

    await admin
      .from("pedidos_nota")
      .update({
        status: "AGUARDANDO_APROVACAO",
        erro: ia.resposta.eh_pedido_de_nota
          ? itensFinais.length
            ? null
            : "A IA não encontrou nenhuma nota nas mensagens."
          : "A IA entendeu que as mensagens não são um pedido de nota.",
        ia_modelo: ia.modelo,
        ia_tokens_entrada: ia.tokensEntrada,
        ia_tokens_saida: ia.tokensSaida,
        ia_custo_usd: ia.custoUsd,
      })
      .eq("id", pedidoId);

    return { itens: itensFinais.length, motivo: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha na extração.";
    await admin.from("pedidos_nota").update({ status: "ERRO", erro: `Extração: ${msg}` }).eq("id", pedidoId);
    throw e;
  }
}
