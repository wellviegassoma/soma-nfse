// Leitura de extrato bancário: OFX (determinístico, sem custo) ou PDF/imagem
// (IA com saída estruturada). Sem banco e sem "server-only" — quem lê o
// arquivo e grava é lib/extratos-arquivos.ts.

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { mesmaConta } from "@/lib/extratos-conta";

export { mesmaConta };

export const MODELO_LEITURA = "claude-sonnet-5-5";
const PRECO = { entrada: 2, saida: 10 }; // US$ por milhão de tokens

export type Leitura = {
  metodo: "OFX" | "IA";
  ehExtrato: boolean;
  tipoDocumento: string | null;
  banco: string | null;
  codigoBanco: string | null;
  agencia: string | null;
  conta: string | null;
  titularNome: string | null;
  titularDocumento: string | null; // só dígitos
  periodoInicio: string | null; // YYYY-MM-DD
  periodoFim: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  totalEntradas: number | null;
  totalSaidas: number | null;
  qtdLancamentos: number | null;
  observacao: string | null;
};

export type ContaReferencia = { banco: string; agencia: string; conta: string };

// ------------------------------------------------------------------ OFX

export function pareceOfx(nome: string, buf: Buffer): boolean {
  if (/\.ofx$/i.test(nome)) return true;
  const ini = buf.subarray(0, 400).toString("latin1");
  return /OFXHEADER|<OFX>/i.test(ini);
}

function tag(texto: string, nome: string): string | null {
  const m = texto.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() || null : null;
}
function dataOfx(v: string | null): string | null {
  const m = v?.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function valorOfx(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

export function lerOfx(buf: Buffer): Leitura {
  const texto = buf.toString(/encoding:\s*utf-?8/i.test(buf.subarray(0, 400).toString("latin1")) ? "utf8" : "latin1");
  const valores = (texto.match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) ?? [])
    .map((b) => valorOfx(tag(b, "TRNAMT")))
    .filter((v): v is number => v !== null && v !== 0);
  const entradas = r2(valores.filter((v) => v > 0).reduce((a, b) => a + b, 0));
  const saidas = r2(-valores.filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const saldoFinal = valorOfx(tag(texto, "BALAMT"));
  return {
    metodo: "OFX",
    ehExtrato: true,
    tipoDocumento: "Extrato OFX",
    banco: tag(texto, "ORG"),
    codigoBanco: tag(texto, "BANKID")?.replace(/\D/g, "").padStart(3, "0").slice(-3) ?? null,
    agencia: tag(texto, "BRANCHID"),
    conta: tag(texto, "ACCTID"),
    titularNome: null,
    titularDocumento: null,
    periodoInicio: dataOfx(tag(texto, "DTSTART")),
    periodoFim: dataOfx(tag(texto, "DTEND")),
    saldoInicial: saldoFinal !== null ? r2(saldoFinal - entradas + saidas) : null,
    saldoFinal,
    totalEntradas: entradas,
    totalSaidas: saidas,
    qtdLancamentos: valores.length,
    observacao: null,
  };
}

// ------------------------------------------------------------------ IA

const RespostaIA = z.object({
  eh_extrato_bancario: z
    .boolean()
    .describe("true só se for extrato de conta bancária/conta de pagamento (corrente, digital, poupança, aplicação). Comprovante, boleto, fatura de cartão, nota fiscal = false."),
  tipo_documento: z.string().describe("O que é o documento, em poucas palavras (ex.: 'extrato de conta corrente', 'comprovante de PIX')."),
  banco_nome: z.string().nullable().describe("Nome do banco/instituição como aparece."),
  codigo_banco: z.string().nullable().describe("Código COMPE de 3 dígitos se aparecer ou se for inequívoco pelo nome (ex.: Itaú 341, Inter 077, Nubank 260); senão null."),
  agencia: z.string().nullable().describe("Agência como aparece (com dígito se houver). null se não aparecer."),
  conta: z.string().nullable().describe("Número da conta como aparece (com dígito). null se não aparecer. Nunca invente."),
  titular_nome: z.string().nullable(),
  titular_documento: z.string().nullable().describe("CNPJ ou CPF do titular, só dígitos, se aparecer."),
  periodo_inicio: z.string().nullable().describe("Primeiro dia do período do extrato, YYYY-MM-DD."),
  periodo_fim: z.string().nullable().describe("Último dia do período do extrato, YYYY-MM-DD."),
  saldo_inicial: z.number().nullable().describe("Saldo anterior / saldo inicial do período, em reais (negativo se devedor)."),
  saldo_final: z.number().nullable().describe("Saldo final do período, em reais (negativo se devedor)."),
  total_entradas: z.number().nullable().describe("Soma dos créditos do período, se der para saber."),
  total_saidas: z.number().nullable().describe("Soma dos débitos do período em valor positivo, se der para saber."),
  quantidade_lancamentos: z.number().nullable(),
  observacao: z
    .string()
    .nullable()
    .describe("Algo que o contador precisa saber: páginas faltando, extrato cortado, mais de uma conta no mesmo arquivo, ilegível. null se nada."),
});

export type ArquivoIA = { tipo: "pdf"; dados: Buffer; nome: string } | { tipo: "imagem"; dados: Buffer; mediaType: string; nome: string };

export async function lerComIA(
  arquivo: ArquivoIA,
  contexto: { empresa: string | null; contas: ContaReferencia[] },
): Promise<{ leitura: Leitura; modelo: string; custoUsd: number | null }> {
  const dicas = [
    contexto.empresa ? `Empresa esperada: ${contexto.empresa}.` : null,
    contexto.contas.length
      ? `Contas cadastradas dessa empresa: ${contexto.contas.map((c) => `${c.banco} ag ${c.agencia} conta ${c.conta}`).join("; ")}.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
  const r = await generateText({
    model: anthropic(MODELO_LEITURA),
    output: Output.object({ schema: RespostaIA }),
    instructions:
      "Você lê extratos bancários brasileiros para um escritório de contabilidade. Extraia os dados do cabeçalho e os saldos do período exatamente como estão no documento. Valores em reais como número (1.234,56 → 1234.56). Não invente: o que não estiver no documento fica null. As contas cadastradas são só referência para reconhecer o número — não copie de lá o que não estiver no arquivo.",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `${dicas}\nArquivo: ${arquivo.nome}` },
          arquivo.tipo === "pdf"
            ? { type: "file", mediaType: "application/pdf", data: arquivo.dados, filename: arquivo.nome }
            : { type: "file", mediaType: arquivo.mediaType, data: arquivo.dados },
        ],
      },
    ],
    maxOutputTokens: 1500,
  });
  const o = r.output;
  const u = r.usage;
  const custo = ((u.inputTokens ?? 0) * PRECO.entrada + (u.outputTokens ?? 0) * PRECO.saida) / 1e6;
  const data = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return {
    modelo: MODELO_LEITURA,
    custoUsd: Math.round(custo * 1e5) / 1e5,
    leitura: {
      metodo: "IA",
      ehExtrato: o.eh_extrato_bancario,
      tipoDocumento: o.tipo_documento,
      banco: o.banco_nome,
      codigoBanco: o.codigo_banco?.replace(/\D/g, "").padStart(3, "0").slice(-3) || null,
      agencia: o.agencia,
      conta: o.conta,
      titularNome: o.titular_nome,
      titularDocumento: o.titular_documento?.replace(/\D/g, "") || null,
      periodoInicio: data(o.periodo_inicio),
      periodoFim: data(o.periodo_fim),
      saldoInicial: o.saldo_inicial,
      saldoFinal: o.saldo_final,
      totalEntradas: o.total_entradas,
      totalSaidas: o.total_saidas,
      qtdLancamentos: o.quantidade_lancamentos,
      observacao: o.observacao,
    },
  };
}

// ------------------------------------------------------------------ casamento e conferência


function ultimoDia(comp: string): number {
  const [a, m] = comp.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** Meses cobertos pelo período (o principal é o de mais dias). */
export function competenciasDoPeriodo(inicio: string | null, fim: string | null): { principal: string | null; meses: string[] } {
  if (!inicio && !fim) return { principal: null, meses: [] };
  const ini = inicio ?? `${fim!.slice(0, 7)}-01`;
  const end = fim ?? `${ini.slice(0, 7)}-${String(ultimoDia(ini.slice(0, 7))).padStart(2, "0")}`;
  const meses: { comp: string; dias: number }[] = [];
  let [a, m] = ini.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 24; i++) {
    const comp = `${a}-${String(m).padStart(2, "0")}`;
    if (comp > end.slice(0, 7)) break;
    const d0 = comp === ini.slice(0, 7) ? Number(ini.slice(8, 10)) : 1;
    const d1 = comp === end.slice(0, 7) ? Number(end.slice(8, 10)) : ultimoDia(comp);
    meses.push({ comp, dias: Math.max(0, d1 - d0 + 1) });
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
  }
  const principal = [...meses].sort((p, q) => q.dias - p.dias)[0]?.comp ?? null;
  // Mês "coberto" = pelo menos 25 dias dele no período (extrato de 01 a 28/29 conta).
  const cobertos = meses.filter((x) => x.dias >= Math.min(25, ultimoDia(x.comp) - 3)).map((x) => x.comp);
  return { principal, meses: cobertos.length ? cobertos : principal ? [principal] : [] };
}

export type Aviso = { codigo: string; mensagem: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (d: string) => d.split("-").reverse().join("/");

export function conferir(p: {
  leitura: Leitura;
  competencia: string | null;
  contaCadastrada: ContaReferencia | null;
  cnpjEmpresa: string | null;
  saldoFinalAnterior: { valor: number; competencia: string } | null;
}): Aviso[] {
  const l = p.leitura;
  const av: Aviso[] = [];
  if (!l.ehExtrato) av.push({ codigo: "NAO_EXTRATO", mensagem: `Não parece extrato bancário (${l.tipoDocumento ?? "documento"}).` });
  if (l.observacao) av.push({ codigo: "OBS_IA", mensagem: l.observacao });
  if (p.competencia && (l.periodoInicio || l.periodoFim)) {
    const ini = l.periodoInicio ?? `${p.competencia}-01`;
    const fim = l.periodoFim ?? `${p.competencia}-${ultimoDia(p.competencia)}`;
    const iniMes = `${p.competencia}-01`;
    const fimMes = `${p.competencia}-${String(ultimoDia(p.competencia)).padStart(2, "0")}`;
    const diasFaltandoIni = ini > iniMes ? Number(ini.slice(8, 10)) - 1 : 0;
    const diasFaltandoFim = fim < fimMes ? ultimoDia(p.competencia) - (fim.slice(0, 7) === p.competencia ? Number(fim.slice(8, 10)) : 0) : 0;
    if (ini.slice(0, 7) > p.competencia || fim.slice(0, 7) < p.competencia) {
      av.push({ codigo: "OUTRO_MES", mensagem: `Período do extrato (${br(ini)} a ${br(fim)}) não é deste mês.` });
    } else if (diasFaltandoIni > 3 || diasFaltandoFim > 3) {
      av.push({ codigo: "PERIODO_INCOMPLETO", mensagem: `Extrato cobre só ${br(ini)} a ${br(fim)} — falta parte do mês.` });
    }
  } else if (l.ehExtrato && !l.periodoInicio && !l.periodoFim) {
    av.push({ codigo: "SEM_PERIODO", mensagem: "Não deu para identificar o período do extrato." });
  }
  if (p.contaCadastrada && l.conta && !mesmaConta(l.conta, p.contaCadastrada.conta)) {
    av.push({ codigo: "CONTA_DIFERENTE", mensagem: `O arquivo é da conta ${l.conta}, não da ${p.contaCadastrada.conta}.` });
  }
  const doc = l.titularDocumento;
  const cnpj = (p.cnpjEmpresa ?? "").replace(/\D/g, "");
  if (doc && doc.length === 14 && cnpj && doc !== cnpj) {
    av.push({ codigo: "OUTRO_CNPJ", mensagem: `Titular do extrato é outro CNPJ (${doc}).` });
  } else if (doc && doc.length === 11 && cnpj) {
    av.push({ codigo: "TITULAR_PF", mensagem: "Titular do extrato é pessoa física — conta do sócio?" });
  }
  if (p.saldoFinalAnterior && l.saldoInicial !== null && Math.abs(p.saldoFinalAnterior.valor - l.saldoInicial) > 0.01) {
    av.push({
      codigo: "SALDO_NAO_BATE",
      mensagem: `Saldo inicial ${brl(l.saldoInicial)} ≠ saldo final do mês anterior ${brl(p.saldoFinalAnterior.valor)}.`,
    });
  }
  if (
    l.saldoInicial !== null &&
    l.saldoFinal !== null &&
    l.totalEntradas !== null &&
    l.totalSaidas !== null &&
    Math.abs(l.saldoInicial + l.totalEntradas - l.totalSaidas - l.saldoFinal) > 0.05
  ) {
    av.push({ codigo: "SOMA_NAO_FECHA", mensagem: "Saldo inicial + entradas − saídas não fecha com o saldo final (página faltando?)." });
  }
  return av;
}
