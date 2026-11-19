import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gravarMensagens } from "@/lib/caixa-postal";
import type { MensagemCaixaPostal } from "@/lib/caixa-postal-core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

// Situação cadastral do CNPJ pela BrasilAPI (mesma fonte do cadastro de
// empresas, lib/cnpj-lookup.ts) — gratuita, sem chave. A BrasilAPI espelha os
// dados abertos do CNPJ da Receita, que podem ter alguns dias/semanas de
// atraso: é um alarme, não substitui o e-CAC/Situação Fiscal.
//
// Roda todo dia (vercel.json). Toda empresa ativa no SOMA deveria estar ATIVA na Receita. Se sair disso
// (INAPTA, SUSPENSA, BAIXADA, NULA), vira mensagem de ALERTA MÁXIMO na
// Central de Intimações — fila, responsável e histórico como as demais.

export const PREFIXO_CNPJ = "CNPJ:";

type RespostaBrasilApi = {
  descricao_situacao_cadastral?: string | null;
  data_situacao_cadastral?: string | null;
  descricao_motivo_situacao_cadastral?: string | null;
  motivo_situacao_cadastral?: number | null;
  situacao_especial?: string | null;
  data_situacao_especial?: string | null;
};

export type SituacaoCnpj = {
  situacao: string | null;
  dataSituacao: string | null;
  motivo: string | null;
  situacaoEspecial: string | null;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function consultarSituacaoCnpj(cnpj: string): Promise<{ ok: true; dados: SituacaoCnpj } | { ok: false; erro: string }> {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let resp: Response;
    try {
      // BrasilAPI recusa (403) o User-Agent padrão do fetch do Node.
      resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
        headers: { "User-Agent": "soma-nfse/1.0" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      if (tentativa < 3) {
        await esperar(2000 * tentativa);
        continue;
      }
      return { ok: false, erro: "BrasilAPI não respondeu." };
    }
    if (resp.status === 429 || resp.status >= 500) {
      if (tentativa < 3) {
        await esperar(3000 * tentativa);
        continue;
      }
      return { ok: false, erro: `BrasilAPI HTTP ${resp.status}.` };
    }
    if (resp.status === 404) return { ok: false, erro: "CNPJ não encontrado na base da Receita (BrasilAPI 404)." };
    if (!resp.ok) return { ok: false, erro: `BrasilAPI HTTP ${resp.status}.` };
    const d = (await resp.json().catch(() => null)) as RespostaBrasilApi | null;
    if (!d) return { ok: false, erro: "BrasilAPI respondeu sem JSON." };
    const motivo = d.descricao_motivo_situacao_cadastral?.trim();
    return {
      ok: true,
      dados: {
        situacao: d.descricao_situacao_cadastral?.trim().toUpperCase() || null,
        dataSituacao: d.data_situacao_cadastral?.slice(0, 10) || null,
        motivo: motivo && !/^SEM MOTIVO$/i.test(motivo) ? motivo : null,
        situacaoEspecial: d.situacao_especial?.trim() || null,
      },
    };
  }
  return { ok: false, erro: "BrasilAPI indisponível." };
}

function alerta(s: SituacaoCnpj, anterior: string | null): MensagemCaixaPostal {
  const data = s.dataSituacao ?? new Date().toISOString().slice(0, 10);
  const partes = [
    `ALERTA MÁXIMO · CNPJ ${s.situacao ?? "?"} na Receita Federal`,
    anterior ? `(era ${anterior})` : null,
    s.motivo ? `· motivo: ${s.motivo}` : null,
    s.situacaoEspecial ? `· situação especial: ${s.situacaoEspecial}` : null,
  ];
  return {
    isn: `${PREFIXO_CNPJ}${s.situacao ?? "?"}:${data}`,
    numeroControle: null,
    assunto: partes.filter(Boolean).join(" "),
    relevante: true,
    sistemaRemetente: null,
    codigoModelo: null,
    tipoOrigem: 1,
    descricaoOrigem: "Receita Federal · Situação cadastral do CNPJ (BrasilAPI)",
    enviadaEm: `${data}T00:00:00-03:00`,
    lidaEm: null,
    cienciaEm: null,
    validadeEm: null,
    excluidaEm: null,
    bruto: { ...s, situacao_anterior: anterior },
    corpo:
      `A situação cadastral do CNPJ na Receita Federal está ${s.situacao ?? "?"}` +
      (s.dataSituacao ? ` desde ${s.dataSituacao.split("-").reverse().join("/")}` : "") +
      (s.motivo ? `, motivo: ${s.motivo}` : "") +
      ".\nEmpresa inapta ou suspensa não pode emitir nota nem ter CND; verificar no e-CAC (Situação Fiscal / Caixa Postal) e regularizar o quanto antes." +
      "\nFonte: BrasilAPI (dados abertos do CNPJ da Receita, podem ter alguns dias de atraso).",
  };
}

/** Consulta, guarda a situação e cria o alerta se a empresa não está ATIVA. */
export async function verificarSituacaoEmpresa(
  admin: Supa,
  empresa: { id: string; cnpj: string },
): Promise<{ ok: true; situacao: string | null; alertou: boolean } | { ok: false; erro: string }> {
  const r = await consultarSituacaoCnpj(empresa.cnpj);
  const agora = new Date().toISOString();
  const { data: atual } = await admin
    .from("cnpj_situacoes")
    .select("situacao, situacao_anterior, mudou_em")
    .eq("company_id", empresa.id)
    .maybeSingle();
  if (!r.ok) {
    await admin.from("cnpj_situacoes").upsert({ company_id: empresa.id, verificado_em: agora, ok: false, erro: r.erro });
    return r;
  }
  const s = r.dados;
  const anterior = (atual?.situacao as string | null) ?? null;
  const mudou = anterior != null && anterior !== s.situacao;
  await admin.from("cnpj_situacoes").upsert({
    company_id: empresa.id,
    situacao: s.situacao,
    data_situacao: s.dataSituacao,
    motivo: s.motivo,
    situacao_especial: s.situacaoEspecial,
    situacao_anterior: mudou ? anterior : (atual?.situacao_anterior ?? null),
    mudou_em: mudou ? agora : (atual?.mudou_em ?? null),
    verificado_em: agora,
    ok: true,
    erro: null,
  });

  // Fora de ATIVA (inclusive na 1ª verificação) → alerta. O isn inclui a
  // situação e a data dela, então a mesma situação não gera alerta repetido
  // toda semana; uma nova mudança gera outro.
  let alertou = false;
  if (s.situacao && s.situacao !== "ATIVA") {
    const g = await gravarMensagens(admin, empresa.id, [alerta(s, mudou ? anterior : null)], {
      primeiraLeitura: false,
      origem: "na verificação semanal do CNPJ (BrasilAPI)",
    });
    alertou = g.ok && g.novas > 0;
  }
  return { ok: true, situacao: s.situacao, alertou };
}
