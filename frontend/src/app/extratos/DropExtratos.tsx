"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { ACEITOS, enviarVarios } from "@/lib/extratos-cliente/enviar";
import type { ResultadoProcessamento } from "@/lib/extratos-arquivos";

type Item = { nome: string; estado: "enviando" | "ok" | "confirmar" | "erro"; texto?: string; avisos?: string[] };

function mesBr(c: string) {
  const [a, m] = c.split("-");
  return `${m}/${a}`;
}

function descrever(r: ResultadoProcessamento): string {
  if (r.situacao === "IDENTIFICADO") {
    return `${r.empresa ?? ""} · ${r.conta ?? ""} · ${r.competencias.map(mesBr).join(", ")}`;
  }
  if (r.situacao === "ERRO") return r.erro ?? "Não foi possível ler.";
  return r.empresa ? `${r.empresa} — precisa confirmar conta/mês na fila` : "Não identificado — confirme na fila";
}

export function DropExtratos({
  companyId,
  titulo,
  subtitulo,
  compacto = false,
}: {
  companyId?: string;
  titulo: string;
  subtitulo: string;
  compacto?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const ocupado = itens.some((i) => i.estado === "enviando");

  async function processar(lista: FileList | File[]) {
    const arquivos = [...lista];
    if (!arquivos.length) return;
    const inicio = itens.length;
    setItens((atual) => [...atual, ...arquivos.map((f) => ({ nome: f.name, estado: "enviando" as const }))]);
    await enviarVarios(arquivos, { companyId, origem: companyId ? "UPLOAD" : "LOTE" }, (i, r) => {
      setItens((atual) => {
        const n = [...atual];
        const res = r.resultado;
        n[inicio + i] = r.error
          ? { nome: arquivos[i].name, estado: "erro", texto: r.error }
          : {
              nome: arquivos[i].name,
              estado: res!.situacao === "IDENTIFICADO" ? "ok" : res!.situacao === "ERRO" ? "erro" : "confirmar",
              texto: descrever(res!),
              avisos: res!.avisos.map((a) => a.mensagem),
            };
        return n;
      });
    });
    router.refresh();
  }

  const pendentesFila = itens.filter((i) => i.estado === "confirmar" || i.estado === "erro").length;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          processar(e.dataTransfer.files);
        }}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors",
          compacto ? "px-4 py-4" : "px-6 py-7",
          arrastando ? "border-brand bg-brand/5" : "border-border bg-surface hover:border-brand/60 hover:bg-surface-muted",
        )}
      >
        <span className="text-sm font-semibold text-foreground">{ocupado ? "Lendo os extratos…" : titulo}</span>
        <span className="text-xs text-foreground/55">{subtitulo}</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACEITOS}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) processar(e.target.files);
          e.target.value = "";
        }}
      />
      {itens.length > 0 && (
        <div className="rounded-xl border border-border bg-surface">
          <ul className="max-h-72 divide-y divide-border overflow-y-auto text-sm">
            {itens.map((i, k) => (
              <li key={k} className="flex items-start gap-2 px-4 py-2">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    i.estado === "enviando" && "animate-pulse bg-foreground/30",
                    i.estado === "ok" && (i.avisos?.length ? "bg-warning" : "bg-success"),
                    i.estado === "confirmar" && "bg-warning",
                    i.estado === "erro" && "bg-danger",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{i.nome}</div>
                  <div className="text-xs text-foreground/60">{i.estado === "enviando" ? "Enviando e lendo…" : i.texto}</div>
                  {i.avisos?.map((a, j) => (
                    <div key={j} className="text-xs text-warning">
                      ⚠ {a}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {pendentesFila > 0 && !ocupado && (
            <div className="border-t border-border px-4 py-2 text-xs">
              {pendentesFila} arquivo(s) precisam de confirmação —{" "}
              <Link href="/extratos/fila" className="text-brand underline">
                abrir a fila
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
