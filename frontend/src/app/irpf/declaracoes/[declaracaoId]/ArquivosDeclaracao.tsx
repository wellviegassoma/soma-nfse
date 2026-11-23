"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Card } from "@/components/ui/Card";
import { formatarDataHora } from "@/lib/formatters";
import { excluirArquivoAction, importarDeclaracaoAction, registrarDocumentoAction } from "@/lib/actions/irpf";

type Arquivo = {
  id: string;
  tipo: string;
  nome_arquivo: string;
  tamanho: number | null;
  retificadora: boolean | null;
  descricao: string | null;
  created_at: string;
};

async function enviar(file: File, ext: string) {
  const contentType = /\.(dec|rec)$/i.test(file.name) ? "text/plain" : file.type || "application/pdf";
  const blob = await upload(`irpf/${crypto.randomUUID()}.${ext}`, file, {
    access: "private",
    handleUploadUrl: "/api/irpf/upload",
    contentType,
  });
  return blob.pathname;
}

export function ArquivosDeclaracao({ declaracaoId, arquivos }: { declaracaoId: string; arquivos: Arquivo[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function aoEscolher(files: FileList | null) {
    if (!files?.length) return;
    setPending(true);
    setMsg(null);
    try {
      const lista = Array.from(files);
      const recs = new Map(lista.filter((f) => /\.rec$/i.test(f.name)).map((f) => [f.name.replace(/\.rec$/i, "").toUpperCase(), f]));
      for (const f of lista) {
        if (/\.rec$/i.test(f.name)) continue;
        if (/\.dec$/i.test(f.name)) {
          const rec = recs.get(f.name.replace(/\.dec$/i, "").toUpperCase()) ?? null;
          const r = await importarDeclaracaoAction({
            decPathname: await enviar(f, "DEC"),
            decNome: f.name,
            recPathname: rec ? await enviar(rec, "REC") : null,
            recNome: rec?.name ?? null,
          });
          if ("error" in r) setMsg(r.error);
          else if (r.declaracaoId !== declaracaoId) setMsg("Este .DEC é de outro contribuinte ou exercício — foi importado lá.");
        } else {
          const ext = f.name.split(".").pop()?.toLowerCase() || "pdf";
          const r = await registrarDocumentoAction({
            declaracaoId,
            pathname: await enviar(f, ext),
            nome: f.name,
            tamanho: f.size,
          });
          if ("error" in r) setMsg(r.error);
        }
      }
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha no envio.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-foreground/70">Arquivos</div>
        <label className="cursor-pointer text-xs text-brand hover:underline">
          {pending ? "Enviando…" : "Enviar"}
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept=".DEC,.REC,.dec,.rec,.pdf,.jpg,.jpeg,.png"
            disabled={pending}
            onChange={(e) => aoEscolher(e.target.files)}
          />
        </label>
      </div>
      <p className="text-xs text-foreground/45">.DEC/.REC atualizam o resumo; PDF e imagens ficam como documentos.</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {arquivos.map((a) => (
          <li key={a.id} className="group flex items-center justify-between gap-2">
            <a href={`/api/irpf/arquivos/${a.id}`} className="min-w-0 truncate text-foreground hover:text-brand" title={a.nome_arquivo}>
              <span className="mr-1 rounded bg-surface-muted px-1 text-[10px] font-semibold text-foreground/55">{a.tipo}</span>
              {a.descricao || a.nome_arquivo}
            </a>
            <span className="shrink-0 text-[11px] text-foreground/40">
              {formatarDataHora(a.created_at).slice(0, 10)}
              {a.tipo === "DOCUMENTO" && (
                <button
                  type="button"
                  className="ml-2 hidden text-foreground/40 hover:text-danger group-hover:inline"
                  onClick={async () => {
                    if (!confirm(`Excluir "${a.nome_arquivo}"?`)) return;
                    const r = await excluirArquivoAction({ declaracaoId, arquivoId: a.id });
                    if ("error" in r) setMsg(r.error);
                    else router.refresh();
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          </li>
        ))}
        {arquivos.length === 0 && <li className="text-xs text-foreground/40">Nenhum arquivo.</li>}
      </ul>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </Card>
  );
}
