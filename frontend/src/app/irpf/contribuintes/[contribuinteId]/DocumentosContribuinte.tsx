"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { enviarDocumentoContribuinteAction, excluirArquivoAction } from "@/lib/actions/irpf";

export type DocumentoAno = {
  id: string;
  declaracaoId: string;
  exercicio: number;
  nome: string;
  descricao: string | null;
  criadoEm: string; // dd/mm/aaaa
};

/**
 * Documentos que o contribuinte mandou, por exercício. Serve para guardar o
 * que chega antes de a declaração começar (o exercício é criado na hora).
 */
export function DocumentosContribuinte({
  contribuinteId,
  exercicios,
  padrao,
  documentos,
}: {
  contribuinteId: string;
  exercicios: number[];
  padrao: number;
  documentos: DocumentoAno[];
}) {
  const router = useRouter();
  const [exercicio, setExercicio] = useState(padrao);
  const [descricao, setDescricao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setPending(true);
    setMsg(null);
    try {
      for (const f of Array.from(files)) {
        const ext = f.name.split(".").pop()?.toLowerCase() || "pdf";
        const blob = await upload(`irpf/${crypto.randomUUID()}.${ext}`, f, {
          access: "private",
          handleUploadUrl: "/api/irpf/upload",
          contentType: f.type || "application/pdf",
        });
        const r = await enviarDocumentoContribuinteAction({
          contribuinteId,
          exercicio,
          pathname: blob.pathname,
          nome: f.name,
          tamanho: f.size,
          descricao: descricao || null,
        });
        if ("error" in r) {
          setMsg(r.error);
          break;
        }
      }
      setDescricao("");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const anos = [...new Set(documentos.map((d) => d.exercicio))].sort((a, b) => b - a);

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground/70">Documentos do contribuinte</div>
      <p className="text-xs text-foreground/45">
        Guarde aqui o que o cliente mandar, mesmo antes de começar a declaração. Escolha o exercício (o ano da entrega).
      </p>
      <div className="flex flex-col gap-2">
        <Select value={exercicio} onChange={(e) => setExercicio(Number(e.target.value))} className="h-10 text-sm">
          {exercicios.map((ex) => (
            <option key={ex} value={ex}>
              Exercício {ex} (ano-calendário {ex - 1})
            </option>
          ))}
        </Select>
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição (opcional) — ex.: informe Itaú"
          className="h-10 text-sm"
        />
      </div>
      <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-muted">
        {pending ? "Enviando…" : "Enviar documentos (PDF ou imagem)"}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          disabled={pending}
          onChange={(e) => enviar(e.target.files)}
        />
      </label>
      {msg && <span className="text-xs text-danger">{msg}</span>}

      {anos.map((ano) => (
        <div key={ano} className="flex flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-foreground/40">
            Exercício {ano} · ano-calendário {ano - 1}
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {documentos
              .filter((d) => d.exercicio === ano)
              .map((d) => (
                <li key={d.id} className="group flex items-center justify-between gap-2">
                  <a href={`/api/irpf/arquivos/${d.id}`} className="min-w-0 truncate hover:text-brand" title={d.nome}>
                    {d.descricao || d.nome}
                  </a>
                  <span className="shrink-0 text-[11px] text-foreground/40">
                    {d.criadoEm}
                    <button
                      type="button"
                      className="ml-2 hidden text-foreground/40 hover:text-danger group-hover:inline"
                      onClick={async () => {
                        if (!confirm(`Excluir "${d.nome}"?`)) return;
                        const r = await excluirArquivoAction({ declaracaoId: d.declaracaoId, arquivoId: d.id });
                        if ("error" in r) setMsg(r.error);
                        else router.refresh();
                      }}
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {documentos.length === 0 && <div className="text-xs text-foreground/40">Nenhum documento ainda.</div>}
    </Card>
  );
}
