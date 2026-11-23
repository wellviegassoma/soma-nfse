"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Input } from "@/components/ui/Input";
import { registrarAnexoManualSei } from "@/lib/actions/sei";

/** Anexa documento à mão (ex.: protocolo físico, ofício recebido por e-mail). */
export function AnexarDocumentoManual({ processoId }: { processoId: string }) {
  const router = useRouter();
  const [descricao, setDescricao] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    setMsg(null);
    try {
      for (const f of Array.from(files)) {
        const ext = (f.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
        const blob = await upload(`sei/manual/${crypto.randomUUID()}.${ext}`, f, {
          access: "private",
          handleUploadUrl: "/api/sei/upload",
          // O token só aceita estes tipos; o resto (Word, Excel…) sobe como genérico.
          contentType: /^(application\/pdf|text\/html|text\/plain|application\/zip|image\/[a-z0-9.+-]+)$/.test(f.type)
            ? f.type
            : "application/octet-stream",
        });
        const r = await registrarAnexoManualSei({
          processoId,
          pathname: blob.pathname,
          nome: f.name,
          tamanho: f.size,
          mime: f.type || "application/octet-stream",
          tipo: descricao.trim() || null,
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
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <details className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <summary className="cursor-pointer text-foreground/70">+ Anexar documento à mão</summary>
      <div className="mt-3 flex flex-col gap-2">
        <Input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Descrição (ex.: Protocolo do balcão)"
          maxLength={300}
          className="h-9"
        />
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={enviando}
          onChange={(e) => enviar(e.target.files)}
          className="text-xs"
        />
        {enviando && <p className="text-xs text-foreground/50">Enviando…</p>}
        {msg && <p className="text-xs text-danger">{msg}</p>}
      </div>
    </details>
  );
}
