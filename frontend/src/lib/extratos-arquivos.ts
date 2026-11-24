import "server-only";
import { get } from "@vercel/blob";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  competenciasDoPeriodo,
  conferir,
  lerComIA,
  lerOfx,
  mesmaConta,
  pareceOfx,
  type Aviso,
  type Leitura,
} from "@/lib/extratos-leitura-core";

// Processa um arquivo de extrato já gravado em extrato_arquivos: lê (OFX ou
// IA), descobre empresa/conta/mês, confere e marca o mês como RECEBIDO.
// Recebe o client do Supabase de quem chama (usuário na tela; admin no
// WhatsApp, que vem pelo webhook).

import type { StatusMes } from "@/lib/extratos-status";
export type { StatusMes };
const ORDEM: StatusMes[] = ["PENDENTE", "RECEBIDO", "CONFERIDO", "CONCILIADO"];

type Conta = { id: string; company_id: string; banco: string; codigo_banco: string | null; agencia: string; conta: string };

export type ResultadoProcessamento = {
  arquivoId: string;
  situacao: "IDENTIFICADO" | "CONFIRMAR" | "ERRO";
  companyId: string | null;
  empresa: string | null;
  contaId: string | null;
  conta: string | null;
  competencias: string[];
  avisos: Aviso[];
  erro?: string;
};

async function baixar(pathname: string): Promise<Buffer> {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error("Arquivo não encontrado no Blob.");
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}

function prev(comp: string): string {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Marca o mês como recebido sem rebaixar um status mais adiantado. */
export async function marcarRecebido(db: SupabaseClient, contaId: string, competencia: string, arquivo?: { url: string; pathname: string; nome: string }) {
  const { data: atual } = await db
    .from("extratos_mensais")
    .select("id, status, blob_pathname")
    .eq("conta_id", contaId)
    .eq("competencia", competencia)
    .maybeSingle();
  const status = (atual?.status as StatusMes | undefined) ?? "PENDENTE";
  // Chegou arquivo: PENDENTE/SEM_MOVIMENTO viram RECEBIDO; o que já andou fica.
  const novo: StatusMes = ORDEM.indexOf(status) >= 1 || status === "ENCERRADA" ? status : "RECEBIDO";
  const campos: Record<string, unknown> = { status: novo };
  if (arquivo && !atual?.blob_pathname) {
    campos.blob_url = arquivo.url;
    campos.blob_pathname = arquivo.pathname;
    campos.nome_arquivo = arquivo.nome;
  }
  if (atual) await db.from("extratos_mensais").update(campos).eq("id", atual.id);
  else await db.from("extratos_mensais").insert({ conta_id: contaId, competencia, ...campos });
}

async function saldoFinalAnterior(db: SupabaseClient, contaId: string, competencia: string) {
  const anterior = prev(competencia);
  const { data } = await db
    .from("extrato_arquivos")
    .select("leitura")
    .eq("conta_id", contaId)
    .eq("competencia", anterior)
    .eq("situacao", "IDENTIFICADO")
    .order("created_at", { ascending: false })
    .limit(5);
  for (const a of data ?? []) {
    const v = (a.leitura as Leitura | null)?.saldoFinal;
    if (typeof v === "number") return { valor: v, competencia: anterior };
  }
  return null;
}

export async function processarArquivo(
  db: SupabaseClient,
  arquivoId: string,
  dica: { companyId?: string | null; contaId?: string | null; competencia?: string | null } = {},
): Promise<ResultadoProcessamento> {
  const { data: arq } = await db.from("extrato_arquivos").select("*").eq("id", arquivoId).single();
  if (!arq) throw new Error("Arquivo não encontrado.");
  const base = { arquivoId, companyId: null, empresa: null, contaId: null, conta: null, competencias: [] as string[], avisos: [] as Aviso[] };

  // Conta escolhida (upload na célula) define a empresa.
  let contaDica: Conta | null = null;
  if (dica.contaId) {
    const { data } = await db.from("extrato_contas_bancarias").select("id, company_id, banco, codigo_banco, agencia, conta").eq("id", dica.contaId).single();
    contaDica = (data as Conta | null) ?? null;
  }
  let companyId = contaDica?.company_id ?? dica.companyId ?? (arq.company_id as string | null);

  const empresaInfo = async (id: string | null) => {
    if (!id) return null;
    const { data } = await db.from("companies").select("id, legal_name, trade_name, cnpj").eq("id", id).single();
    return data as { id: string; legal_name: string; trade_name: string | null; cnpj: string | null } | null;
  };
  let empresa = await empresaInfo(companyId);
  const contasDaEmpresa = async (id: string | null): Promise<Conta[]> => {
    if (!id) return [];
    const { data } = await db.from("extrato_contas_bancarias").select("id, company_id, banco, codigo_banco, agencia, conta").eq("company_id", id).eq("ativo", true);
    return (data ?? []) as Conta[];
  };
  let contas = await contasDaEmpresa(companyId);

  // 1) Leitura
  let leitura: Leitura;
  let modelo: string | null = null;
  let custo: number | null = null;
  try {
    const buf = await baixar(arq.blob_pathname as string);
    const nome = arq.nome_arquivo as string;
    const mime = (arq.mime as string | null) ?? "";
    if (pareceOfx(nome, buf)) leitura = lerOfx(buf);
    else {
      const ehPdf = mime === "application/pdf" || /\.pdf$/i.test(nome);
      const ehImagem = /^image\/(jpeg|png|webp|gif)$/.test(mime);
      if (!ehPdf && !ehImagem) throw new Error("Formato não suportado (use PDF, imagem ou OFX).");
      const r = await lerComIA(
        ehPdf ? { tipo: "pdf", dados: buf, nome } : { tipo: "imagem", dados: buf, mediaType: mime, nome },
        { empresa: empresa ? empresa.trade_name || empresa.legal_name : null, contas },
      );
      leitura = r.leitura;
      modelo = r.modelo;
      custo = r.custoUsd;
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao ler o arquivo.";
    await db.from("extrato_arquivos").update({ situacao: "ERRO", avisos: [{ codigo: "ERRO", mensagem: erro }] }).eq("id", arquivoId);
    return { ...base, situacao: "ERRO", erro, avisos: [{ codigo: "ERRO", mensagem: erro }] };
  }

  // 2) Empresa pelo CNPJ do titular, se ainda não sabemos
  if (!companyId && leitura.titularDocumento?.length === 14) {
    const { data } = await db.from("companies").select("id").eq("cnpj", leitura.titularDocumento).limit(2);
    if (data?.length === 1) {
      companyId = data[0].id as string;
      empresa = await empresaInfo(companyId);
      contas = await contasDaEmpresa(companyId);
    }
  }

  // 3) Conta: a escolhida, ou pelo número lido
  let conta: Conta | null = contaDica;
  if (!conta && leitura.conta) {
    let candidatas = contas.filter((c) => mesmaConta(c.conta, leitura.conta));
    if (!companyId) {
      const { data } = await db
        .from("extrato_contas_bancarias")
        .select("id, company_id, banco, codigo_banco, agencia, conta")
        .eq("ativo", true)
        .ilike("conta", `%${(leitura.conta ?? "").replace(/\D/g, "").replace(/^0+/, "").slice(0, 5)}%`);
      candidatas = ((data ?? []) as Conta[]).filter((c) => mesmaConta(c.conta, leitura.conta));
    }
    if (leitura.codigoBanco && candidatas.length > 1) {
      const mesmoBanco = candidatas.filter((c) => !c.codigo_banco || c.codigo_banco === leitura.codigoBanco);
      if (mesmoBanco.length) candidatas = mesmoBanco;
    }
    if (candidatas.length === 1) conta = candidatas[0];
  }
  // Empresa com uma conta só daquele banco e o arquivo sem número legível
  if (!conta && !leitura.conta && leitura.codigoBanco && contas.length) {
    const doBanco = contas.filter((c) => c.codigo_banco === leitura.codigoBanco);
    if (doBanco.length === 1) conta = doBanco[0];
  }
  if (conta && !companyId) {
    companyId = conta.company_id;
    empresa = await empresaInfo(companyId);
  }

  // 4) Mês
  const periodo = competenciasDoPeriodo(leitura.periodoInicio, leitura.periodoFim);
  const competencia = dica.competencia ?? periodo.principal;
  const meses = dica.competencia ? [dica.competencia] : periodo.meses;

  // 5) Conferência
  const avisos = conferir({
    leitura,
    competencia,
    contaCadastrada: contaDica,
    cnpjEmpresa: empresa?.cnpj ?? null,
    saldoFinalAnterior: conta && competencia ? await saldoFinalAnterior(db, conta.id, competencia) : null,
  });
  if (!conta && companyId && leitura.ehExtrato) {
    avisos.push({
      codigo: "CONTA_NAO_CADASTRADA",
      mensagem: `Conta ${[leitura.banco, leitura.agencia && `ag ${leitura.agencia}`, leitura.conta].filter(Boolean).join(" ")} não está cadastrada nesta empresa.`,
    });
  }

  const identificado = !!conta && !!competencia && leitura.ehExtrato && !avisos.some((a) => a.codigo === "CONTA_DIFERENTE" || a.codigo === "OUTRO_MES");
  await db
    .from("extrato_arquivos")
    .update({
      company_id: companyId,
      conta_id: conta?.id ?? null,
      competencia,
      situacao: identificado ? "IDENTIFICADO" : "CONFIRMAR",
      leitura,
      avisos,
      ia_modelo: modelo,
      ia_custo_usd: custo,
    })
    .eq("id", arquivoId);

  if (identificado && conta) {
    for (const m of meses) {
      await marcarRecebido(db, conta.id, m, { url: arq.blob_url as string, pathname: arq.blob_pathname as string, nome: arq.nome_arquivo as string });
    }
  }

  return {
    arquivoId,
    situacao: identificado ? "IDENTIFICADO" : "CONFIRMAR",
    companyId,
    empresa: empresa ? empresa.trade_name || empresa.legal_name : null,
    contaId: conta?.id ?? null,
    conta: conta ? `${conta.banco} ${conta.conta}` : null,
    competencias: identificado ? meses : competencia ? [competencia] : [],
    avisos,
  };
}
