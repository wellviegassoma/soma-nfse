import Link from "next/link";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { rotuloCompetencia, somarMeses } from "@/lib/tarefas-comum";

const COMPETENCIA = /^\d{4}-\d{2}$/;

export function competenciaDoParam(v: string | string[] | undefined): string {
  return typeof v === "string" && COMPETENCIA.test(v) ? v : mesAnteriorBrasilia();
}

export function SeletorCompetencia({ competencia, base }: { competencia: string; base: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Link href={`${base}?competencia=${somarMeses(competencia, -1)}`} className="rounded-lg border border-border px-2 py-1 hover:bg-surface-muted" aria-label="Competência anterior">
        ‹
      </Link>
      <span className="min-w-28 text-center font-semibold">Competência {rotuloCompetencia(competencia)}</span>
      <Link href={`${base}?competencia=${somarMeses(competencia, 1)}`} className="rounded-lg border border-border px-2 py-1 hover:bg-surface-muted" aria-label="Próxima competência">
        ›
      </Link>
    </div>
  );
}

