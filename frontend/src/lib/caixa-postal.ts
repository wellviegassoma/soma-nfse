import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerCorpo, lerMensagens, statusInicial, SERVICO_DETALHE, SERVICO_LISTA, type MensagemCaixaPostal } from "@/lib/caixa-postal-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type EmpresaCaixaPostal = { id: string; cnpj: string };

export type ResultadoLeitura =
  | { ok: true; quantidade: number; novas: number }
  | { ok: false; erro: string };

/**
 * Uma chamada paga (MSGCONTRIBUINTE61, 1ª página = até 50 mensagens mais
 * recentes, lidas e não lidas). Só a LISTA — nunca o detalhamento (dá
 * ciência, ver caixa-postal-core.ts). O integra-contador guarda a resposta
 * 1h, então reler a mesma empresa logo em seguida não cobra de novo.
 */
export async function buscarListaCaixaPostal(
  cnpj: string,
): Promise<{ ok: true; mensagens: MensagemCaixaPostal[] } | { ok: false; erro: string }> {
  let r: Response;
  try {
    r = await fetch(`${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${cnpj}/chamar`, {
      method: "POST",
      headers: {
        "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id_sistema: SERVICO_LISTA.idSistema,
        id_servico: SERVICO_LISTA.idServico,
        dados: { statusLeitura: 0, indicadorPagina: 0 },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, erro: "Não foi possível falar com o Integra Contador agora." };
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, erro: traduzirErro(String(corpo?.detail ?? `Integra Contador respondeu HTTP ${r.status}.`)) };
  return { ok: true, mensagens: lerMensagens(corpo?.resposta?.dados) };
}

/**
 * Conteúdo de UMA mensagem (MSGDETALHAMENTO62). ATENÇÃO: DÁ CIÊNCIA da
 * intimação, igual a abrir no e-CAC. Só chamar depois de confirmação humana
 * (lib/actions/caixa-postal.ts → abrirConteudo). Uma chamada paga.
 */
export async function buscarConteudoCaixaPostal(
  cnpj: string,
  isn: string,
): Promise<{ ok: true; corpo: string } | { ok: false; erro: string }> {
  let r: Response;
  try {
    r = await fetch(`${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${cnpj}/chamar`, {
      method: "POST",
      headers: {
        "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id_sistema: SERVICO_DETALHE.idSistema, id_servico: SERVICO_DETALHE.idServico, dados: { isn } }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { ok: false, erro: "Não foi possível falar com o Integra Contador agora." };
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, erro: traduzirErro(String(corpo?.detail ?? `Integra Contador respondeu HTTP ${r.status}.`)) };
  const texto = lerCorpo(corpo?.resposta?.dados);
  if (!texto) return { ok: false, erro: "A Receita respondeu sem o texto da mensagem." };
  return { ok: true, corpo: texto };
}

function traduzirErro(msg: string): string {
  if (/procura[çc][ãa]o|HTTP 403|AcessoNegado|n[ãa]o possui/i.test(msg)) {
    return `Sem procuração no e-CAC para a Caixa Postal (código 00006). ${msg}`.slice(0, 1000);
  }
  return msg.slice(0, 1000);
}

function linhaReceita(companyId: string, m: MensagemCaixaPostal) {
  return {
    company_id: companyId,
    isn: m.isn,
    numero_controle: m.numeroControle,
    assunto: m.assunto,
    relevante: m.relevante,
    sistema_remetente: m.sistemaRemetente,
    codigo_modelo: m.codigoModelo,
    tipo_origem: m.tipoOrigem,
    descricao_origem: m.descricaoOrigem,
    enviada_em: m.enviadaEm,
    lida_em: m.lidaEm,
    ciencia_em: m.cienciaEm,
    validade_em: m.validadeEm,
    excluida_em: m.excluidaEm,
    dados: m.bruto,
    atualizada_em: new Date().toISOString(),
  };
}

/** Lê a Caixa Postal de uma empresa e grava: mensagens novas entram na fila; as já conhecidas só têm os dados da Receita atualizados (o tratamento interno nunca é sobrescrito). */
export async function lerCaixaPostalEmpresa(supabase: Supa, empresa: EmpresaCaixaPostal): Promise<ResultadoLeitura> {
  const lista = await buscarListaCaixaPostal(empresa.cnpj);
  if (!lista.ok) {
    await supabase.from("caixa_postal_leituras").upsert({
      company_id: empresa.id,
      lida_em: new Date().toISOString(),
      ok: false,
      erro: lista.erro,
    });
    return lista;
  }

  const [{ data: existentes, error: errExist }, { data: leituraAnterior }] = await Promise.all([
    supabase.from("caixa_postal_mensagens").select("isn").eq("company_id", empresa.id),
    supabase.from("caixa_postal_leituras").select("company_id").eq("company_id", empresa.id).eq("ok", true).maybeSingle(),
  ]);
  if (errExist) return { ok: false, erro: `Banco: ${errExist.message}` };

  const conhecidos = new Set((existentes ?? []).map((e) => e.isn as string));
  const primeiraLeitura = !leituraAnterior && conhecidos.size === 0;
  const novas = lista.mensagens.filter((m) => !conhecidos.has(m.isn));
  const velhas = lista.mensagens.filter((m) => conhecidos.has(m.isn));

  if (velhas.length) {
    const { error } = await supabase
      .from("caixa_postal_mensagens")
      .upsert(velhas.map((m) => linhaReceita(empresa.id, m)), { onConflict: "company_id,isn" });
    if (error) return { ok: false, erro: `Banco: ${error.message}` };
  }

  let novasNaFila = 0;
  if (novas.length) {
    const agora = new Date();
    const linhas = novas.map((m) => {
      const status = statusInicial(m, primeiraLeitura, agora);
      if (status === "nova") novasNaFila += 1;
      return {
        ...linhaReceita(empresa.id, m),
        status,
        observacao: status === "resolvida" ? "Importação inicial: mensagem com mais de 90 dias (histórico)." : null,
        tratamento_em: status === "resolvida" ? agora.toISOString() : null,
      };
    });
    const { data: inseridas, error } = await supabase
      .from("caixa_postal_mensagens")
      .upsert(linhas, { onConflict: "company_id,isn", ignoreDuplicates: true })
      .select("id, status, observacao");
    if (error) return { ok: false, erro: `Banco: ${error.message}` };
    const historico = (inseridas ?? []).map((r) => ({
      mensagem_id: r.id,
      status: r.status,
      observacao: r.observacao ?? "Mensagem encontrada na Caixa Postal do e-CAC.",
    }));
    if (historico.length) await supabase.from("caixa_postal_tratamentos").insert(historico);
  }

  await supabase.from("caixa_postal_leituras").upsert({
    company_id: empresa.id,
    lida_em: new Date().toISOString(),
    ok: true,
    erro: null,
    quantidade: lista.mensagens.length,
    novas: novasNaFila,
  });
  return { ok: true, quantidade: lista.mensagens.length, novas: novasNaFila };
}

/** Empresas que entram na leitura: ativas, com CNPJ (14 dígitos). */
export async function empresasParaLer(supabase: Supa): Promise<(EmpresaCaixaPostal & { nome: string })[]> {
  const { data } = await supabase
    .from("companies")
    .select("id, cnpj, legal_name, trade_name, codigo_cliente")
    .eq("ativa", true)
    .not("cnpj", "is", null)
    .order("legal_name");
  return (data ?? [])
    .map((c) => ({ ...c, cnpj: String(c.cnpj).replace(/\D/g, "") }))
    .filter((c) => c.cnpj.length === 14)
    .map((c) => ({
      id: c.id as string,
      cnpj: c.cnpj,
      nome: c.codigo_cliente ? `#${c.codigo_cliente} ${c.trade_name || c.legal_name}` : (c.trade_name || c.legal_name) as string,
    }));
}

/** Contagem pro selo do menu: mensagens ainda não resolvidas e sem ninguém tratando. */
export async function contarIntimacoesNovas(supabase: Supa): Promise<number> {
  const { count, error } = await supabase
    .from("caixa_postal_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("status", "nova");
  return error ? 0 : (count ?? 0);
}
