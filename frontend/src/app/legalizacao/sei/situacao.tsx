import { cn } from "@/lib/cn";
import { BOLA_LABELS, SITUACAO_LABELS, diasDesde, type SeiBola, type SeiSituacao } from "@/lib/sei-labels";

const CORES: Record<SeiSituacao, string> = {
  EM_ANDAMENTO: "bg-surface-muted text-foreground/70",
  EXIGENCIA: "bg-warning/10 text-warning",
  LICENCA_EMITIDA: "bg-success/10 text-success",
  CONCLUIDO: "bg-brand/10 text-brand",
};

export function SituacaoBadge({ situacao }: { situacao: SeiSituacao }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", CORES[situacao])}>
      {SITUACAO_LABELS[situacao]}
    </span>
  );
}

/** "manual" = cadastrado à mão e ainda não assumido pela sincronização; "físico" = fora do SEI. */
export function OrigemBadge({
  origem,
  cadastradoEm,
  sincronizadoEm,
}: {
  origem: string | null;
  cadastradoEm: string | null;
  sincronizadoEm: string | null;
}) {
  if (origem === "FISICO") {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
        físico / fora do SEI
      </span>
    );
  }
  if (cadastradoEm && !sincronizadoEm) {
    return (
      <span className="inline-flex whitespace-nowrap rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
        manual
      </span>
    );
  }
  return null;
}

export function AnalisarBadge({ nunca }: { nunca: boolean }) {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
      {nunca ? "a analisar" : "andamento novo"}
    </span>
  );
}

const BOLA_CORES: Record<SeiBola, string> = {
  SOMA: "bg-warning/15 text-warning",
  CLIENTE: "bg-surface-muted text-foreground/70",
  PREFEITURA: "bg-surface-muted text-foreground/60",
};

/** Com quem está a bola e há quantos dias. */
export function BolaBadge({ bola, desde }: { bola: SeiBola; desde: string | null }) {
  const dias = diasDesde(desde);
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", BOLA_CORES[bola])}>
      {BOLA_LABELS[bola]}
      {dias != null && ` · ${dias}d`}
    </span>
  );
}

export function NovidadeBadge() {
  return (
    <span className="inline-flex whitespace-nowrap rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
      novo
    </span>
  );
}

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export const dataHoraBr = (iso: string | null) => (iso ? fmtDataHora.format(new Date(iso)) : "—");
export const dataBr = (iso: string | null) => (iso ? fmtData.format(new Date(`${iso.slice(0, 10)}T12:00:00Z`)) : "—");
export const diaBr = (iso: string) => fmtData.format(new Date(iso));

/** Tem andamento novo que ninguém marcou como visto. */
export function temNovidade(p: { novidade_em: string | null; visto_em: string | null }) {
  return !!p.novidade_em && (!p.visto_em || p.visto_em < p.novidade_em);
}
