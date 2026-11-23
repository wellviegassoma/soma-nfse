// Rótulos e regras puras do módulo SEI — sem "server-only" para servir também
// a componentes. A lógica de servidor fica em lib/sei.ts.

export type SeiSituacao = "EM_ANDAMENTO" | "EXIGENCIA" | "LICENCA_EMITIDA" | "CONCLUIDO";

export const SITUACAO_LABELS: Record<SeiSituacao, string> = {
  EM_ANDAMENTO: "Em análise",
  EXIGENCIA: "Exigência pendente",
  LICENCA_EMITIDA: "Licença emitida",
  CONCLUIDO: "Concluído",
};

export type VinculoOrigem = "MANUAL" | "FORMULARIO_DOC" | "FORMULARIO_IM" | "INTERESSADO" | "FORMULARIO_NOME";

export const VINCULO_LABELS: Record<VinculoOrigem, string> = {
  MANUAL: "vinculado à mão",
  FORMULARIO_DOC: "pelo CNPJ/CPF do requerimento",
  FORMULARIO_IM: "pela inscrição municipal do requerimento",
  INTERESSADO: "pelo interessado no SEI",
  FORMULARIO_NOME: "pelo nome no requerimento",
};

export const MOTIVOS_ARQUIVAMENTO = ["Cliente saiu da SOMA", "Processo encerrado", "Processo de outro cliente", "Outro"] as const;

export type MotivoDispensa =
  | "PONTO_REFERENCIA"
  | "SEM_ATENDIMENTO_LOCAL"
  | "ATIVIDADE_DISPENSADA"
  | "PROCESSO_FORA_SEI"
  | "OUTRO";

export const MOTIVO_DISPENSA_LABELS: Record<MotivoDispensa, string> = {
  PONTO_REFERENCIA: "Ponto de referência",
  SEM_ATENDIMENTO_LOCAL: "Sem atendimento no local",
  ATIVIDADE_DISPENSADA: "Atividade dispensada da licença",
  PROCESSO_FORA_SEI: "Processo fora do SEI (físico/outro órgão)",
  OUTRO: "Outro",
};

/** Petrópolis/RJ no IBGE — clientes daqui precisam de processo no SEI ou dispensa. */
export const IBGE_PETROPOLIS = "3303906";

/** Tramitação e controle de acesso: não contam como "o que aconteceu" no processo. */
export function andamentoRotineiro(descricao: string): boolean {
  return /^(Processo (recebido|remetido) |Disponibilizado acesso externo|Cancelada disponibiliza|Processo p[úu]blico gerado|Envio de correspond[êe]ncia eletr[ôo]nica|Reabertura do processo)/i.test(
    descricao.trim(),
  );
}

export function formatarDocumento(doc: string | null): string {
  if (!doc) return "";
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (doc.length === 11) return doc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return doc;
}
