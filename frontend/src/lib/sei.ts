import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Módulo SEI (Legalização) — regras do lado do servidor. Spec: docs/sei.md.
// A extensão "SOMA · SEI" lê o SEI no Chrome logado e manda os dados crus;
// aqui ficam o vínculo com o cliente e a classificação da situação.

import { andamentoRotineiro, type SeiSituacao, type VinculoOrigem } from "@/lib/sei-labels";

export const SEI_PROCURADOR = "WELLINGTON VIEGAS WENDLING DUARTE";

export function soDigitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/** Nome para comparação: sem acento, maiúsculo, sem sufixo societário nem pontuação. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\b(LTDA|ME|EPP|EIRELI|SLU|S A|SA|SS|S S|SOCIEDADE SIMPLES|LIMITADA)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ehProcurador(nome: string): boolean {
  return normalizarNome(nome) === normalizarNome(SEI_PROCURADOR);
}

// ---------------------------------------------------------------------------
// Formulário (primeiro documento, gerado no SEI)
// ---------------------------------------------------------------------------

export type DadosFormulario = { nome: string | null; documento: string | null; im: string | null };

/**
 * Lê nome, CNPJ/CPF e inscrição municipal do texto do formulário. Formatos vistos:
 * - Requerimento de Licença Sanitária: "RAZÃO SOCIAL" / "INSCRIÇÃO MUNICIPAL (ALVARÁ)" / "CNPJ"
 *   (o campo CNPJ traz CPF quando é autônomo), cada valor na linha seguinte ao rótulo;
 * - Formulário do ISS / Baixa de Inscrição / Requerimento Padrão Fazenda: "Nome:" / "CPF/CNPJ:".
 * O texto chega com uma linha por célula (a extensão quebra nas tags).
 */
export function lerFormulario(texto: string): DadosFormulario {
  const linhas = texto
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const depoisDe = (re: RegExp): string | null => {
    const i = linhas.findIndex((l) => re.test(l));
    if (i < 0) return null;
    // Valor na mesma linha ("Nome: Fulano") ou na seguinte.
    const mesma = linhas[i].replace(re, "").replace(/^[\s:]+/, "").trim();
    if (mesma) return mesma;
    const prox = linhas[i + 1];
    if (!prox || /:$/.test(prox)) return null; // a linha seguinte já é outro rótulo: campo vazio
    return prox;
  };

  let nome =
    depoisDe(/^RAZ[ÃA]O SOCIAL\b:?/i) ??
    depoisDe(/^NOME( DO (REQUERENTE|CONTRIBUINTE|AUT[ÔO]NOMO))?\s*:/i) ??
    depoisDe(/^NOME( DO (REQUERENTE|CONTRIBUINTE|AUT[ÔO]NOMO))?$/i);
  if (nome && (ehProcurador(nome) || /^wel+ing/i.test(nome))) nome = null;

  const imBruta = depoisDe(/^INSCRI[ÇC][ÃA]O MUNICIPAL( \(ALVAR[ÁA]\))?\s*:?/i);
  const im = imBruta && /^\d[\d./-]*$/.test(imBruta.trim()) ? soDigitos(imBruta) : null;

  const todo = linhas.join("\n");
  const cnpj = todo.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/)?.[0];
  const cpf = todo.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0];
  const documento = soDigitos(cnpj ?? cpf) || null;

  return { nome: nome || null, documento, im };
}

// ---------------------------------------------------------------------------
// Vínculo com o cliente (ordem da spec; MANUAL é tratado por quem chama)
// ---------------------------------------------------------------------------

type EmpresaBusca = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  municipal_registration: string | null;
};

export async function encontrarEmpresa(
  supabase: SupabaseClient,
  form: DadosFormulario,
  interessados: string[],
  carregarEmpresas: () => Promise<EmpresaBusca[]>,
): Promise<{ companyId: string; origem: VinculoOrigem } | null> {
  if (form.documento) {
    const doc = form.documento;
    const formatado =
      doc.length === 14
        ? doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
        : doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
    const coluna = doc.length === 14 ? "cnpj" : "cpf";
    const { data } = await supabase.from("companies").select("id").in(coluna, [doc, formatado]).limit(1);
    if (data?.[0]) return { companyId: data[0].id, origem: "FORMULARIO_DOC" };
  }

  const empresas = await carregarEmpresas();

  if (form.im) {
    const achou = empresas.find((e) => soDigitos(e.municipal_registration) === form.im);
    if (achou) return { companyId: achou.id, origem: "FORMULARIO_IM" };
  }

  const porNome = (nome: string) => {
    const alvo = normalizarNome(nome);
    if (alvo.length < 4) return null;
    const iguais = empresas.filter(
      (e) => normalizarNome(e.legal_name) === alvo || (e.trade_name && normalizarNome(e.trade_name) === alvo),
    );
    return iguais.length === 1 ? iguais[0] : null; // nome ambíguo não vincula
  };

  for (const interessado of interessados) {
    if (ehProcurador(interessado)) continue;
    const achou = porNome(interessado);
    if (achou) return { companyId: achou.id, origem: "INTERESSADO" };
  }

  if (form.nome) {
    const achou = porNome(form.nome);
    if (achou) return { companyId: achou.id, origem: "FORMULARIO_NOME" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Andamentos
// ---------------------------------------------------------------------------

export type AndamentoEntrada = { data_hora: string; unidade: string; descricao: string };

/** "12/11/2026 15:21" (horário de Brasília) → ISO com -03:00. */
export function dataHoraSei(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`;
}

/** "08/01/2026" → "2026-01-08". */
export function dataSei(s: string | null | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function chaveAndamento(a: { data_hora: string; unidade: string; descricao: string }): string {
  return createHash("sha1").update(`${a.data_hora}|${a.unidade}|${a.descricao}`).digest("hex");
}

const RE_LICENCA = /EXPEDIDA E ASSINADA (A )?LS\b|LICEN[ÇC]A SANIT[ÁA]RIA.{0,40}(EXPEDIDA|EMITIDA|ASSINADA)/i;
const RE_EXIGENCIA =
  /aguardando (o )?cumprimento|termo de intima[çc][ãa]o|exig[êe]ncia|comunicar ao requerente|dever[áa] (anexar|apresentar)|pend[êe]ncia/i;

/** Situação a partir dos andamentos (mais recente primeiro). */
export function classificarSituacao(andamentosDesc: { descricao: string }[]): SeiSituacao {
  if (andamentosDesc.some((a) => RE_LICENCA.test(a.descricao))) return "LICENCA_EMITIDA";
  const maisRecente = andamentosDesc[0]?.descricao ?? "";
  const relevantes = andamentosDesc.filter((a) => !andamentoRotineiro(a.descricao));
  const ultimoRelevante = relevantes[0]?.descricao ?? "";
  if (/^Conclus[ãa]o do processo/i.test(maisRecente) && !RE_EXIGENCIA.test(ultimoRelevante)) return "CONCLUIDO";
  if (RE_EXIGENCIA.test(ultimoRelevante)) return "EXIGENCIA";
  return "EM_ANDAMENTO";
}

/** Último andamento que interessa ler (pula tramitação; se só houver tramitação, usa o mais recente). */
export function ultimoAndamentoRelevante<T extends { descricao: string }>(andamentosDesc: T[]): T | null {
  return andamentosDesc.find((a) => !andamentoRotineiro(a.descricao)) ?? andamentosDesc[0] ?? null;
}
