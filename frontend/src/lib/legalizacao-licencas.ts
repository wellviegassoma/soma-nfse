// Regras de vencimento e situação das licenças (alvarás, licença sanitária,
// conselho de classe etc.). Puro — sem acesso a banco — pra rodar tanto no
// servidor (painel) quanto no cliente (sugestão de vencimento no formulário).
//
// Datas sempre como string "YYYY-MM-DD" (mesmo motivo de hojeSaoPaulo em
// processos/status.ts: new Date("2026-04-30") é meia-noite UTC, que já é
// dia 29 em Brasília à noite).

import type { StatusTone } from "@/lib/formatters";

export type ModoVencimento = "DATA_FIXA" | "MESES_APOS_EMISSAO" | "INDETERMINADO";

export const MODO_VENCIMENTO_LABELS: Record<ModoVencimento, string> = {
  DATA_FIXA: "Data fixa no ano",
  MESES_APOS_EMISSAO: "Meses após a emissão",
  INDETERMINADO: "Validade indeterminada",
};

export type RegraVencimento = {
  id: string;
  tipo_id: string;
  municipality_ibge_code: string | null;
  municipality_name: string | null;
  state: string | null;
  modo: ModoVencimento;
  dia: number | null;
  mes: number | null;
  meses: number | null;
  antecedencia_dias: number;
  observacao: string | null;
};

export const ANTECEDENCIA_PADRAO_DIAS = 60;

const MESES_NOME = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function descreverRegra(r: Pick<RegraVencimento, "modo" | "dia" | "mes" | "meses">): string {
  if (r.modo === "DATA_FIXA") return `Vence todo ano em ${String(r.dia).padStart(2, "0")}/${MESES_NOME[(r.mes ?? 1) - 1]}`;
  if (r.modo === "MESES_APOS_EMISSAO") return `Vence ${r.meses} ${r.meses === 1 ? "mês" : "meses"} após a emissão`;
  return "Validade indeterminada";
}

// Regra do município da empresa; se não houver, a regra padrão do tipo
// (sem município); se nem isso, null (vencimento informado à mão).
export function regraAplicavel(
  regras: RegraVencimento[],
  tipoId: string,
  municipioIbge: string | null,
): RegraVencimento | null {
  const doTipo = regras.filter((r) => r.tipo_id === tipoId);
  return (
    (municipioIbge ? doTipo.find((r) => r.municipality_ibge_code === municipioIbge) : undefined) ??
    doTipo.find((r) => r.municipality_ibge_code == null) ??
    null
  );
}

function iso(ano: number, mes: number, dia: number): string {
  // Dia além do fim do mês (ex.: 31/04, 29/02 em ano comum) cai no último dia.
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

// Vencimento sugerido pela regra. undefined = a regra não consegue calcular
// (falta a data de emissão); null = validade indeterminada.
export function calcularVencimento(
  regra: Pick<RegraVencimento, "modo" | "dia" | "mes" | "meses">,
  dataEmissao: string | null,
): string | null | undefined {
  if (regra.modo === "INDETERMINADO") return null;
  if (!dataEmissao || !/^\d{4}-\d{2}-\d{2}$/.test(dataEmissao)) return undefined;
  const [a, m, d] = dataEmissao.split("-").map(Number);
  if (regra.modo === "MESES_APOS_EMISSAO") {
    const total = m - 1 + (regra.meses ?? 0);
    return iso(a + Math.floor(total / 12), (total % 12) + 1, d);
  }
  // DATA_FIXA: a próxima ocorrência do dia/mês depois da emissão.
  const noAno = iso(a, regra.mes!, regra.dia!);
  return noAno > dataEmissao ? noAno : iso(a + 1, regra.mes!, regra.dia!);
}

export function diasEntre(deIso: string, ateIso: string): number {
  const [a1, m1, d1] = deIso.split("-").map(Number);
  const [a2, m2, d2] = ateIso.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

export type Situacao = "PENDENTE" | "VENCIDA" | "A_VENCER" | "EM_DIA" | "SEM_VENCIMENTO" | "EM_RENOVACAO";

export const SITUACAO_LABELS: Record<Situacao, string> = {
  PENDENTE: "Pendente de cadastro",
  VENCIDA: "Vencida",
  A_VENCER: "A vencer",
  EM_DIA: "Em dia",
  SEM_VENCIMENTO: "Sem vencimento",
  EM_RENOVACAO: "Em renovação",
};

export const SITUACAO_TONES: Record<Situacao, StatusTone> = {
  PENDENTE: "neutral",
  VENCIDA: "danger",
  A_VENCER: "warning",
  EM_DIA: "success",
  SEM_VENCIMENTO: "success",
  EM_RENOVACAO: "warning",
};

// "A vencer" começa na antecedência da regra (padrão 60 dias) — é a janela
// em que a renovação já precisa estar andando.
export function situacaoLicenca(
  documento: { data_vencimento: string | null } | null | undefined,
  hoje: string,
  antecedenciaDias: number = ANTECEDENCIA_PADRAO_DIAS,
): { situacao: Situacao; dias: number | null } {
  if (!documento) return { situacao: "PENDENTE", dias: null };
  if (documento.data_vencimento == null) return { situacao: "SEM_VENCIMENTO", dias: null };
  const dias = diasEntre(hoje, documento.data_vencimento);
  if (dias < 0) return { situacao: "VENCIDA", dias };
  if (dias <= antecedenciaDias) return { situacao: "A_VENCER", dias };
  return { situacao: "EM_DIA", dias };
}

export function textoDias(dias: number | null): string {
  if (dias == null) return "—";
  if (dias < 0) return `${Math.abs(dias)} dia(s) em atraso`;
  if (dias === 0) return "vence hoje";
  return `em ${dias} dia(s)`;
}
