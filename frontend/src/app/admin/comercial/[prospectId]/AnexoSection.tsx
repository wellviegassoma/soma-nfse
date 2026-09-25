"use client";

import { useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { salvarAnexoComercial, apagarAnexoComercial } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";

type Anexo = { id: string; blob_url: string; nome_arquivo: string; created_at: string };

export function AnexoSection({
  prospectId,
  anexos,
  podeEditar,
}: {
  prospectId: string;
  anexos: Anexo[];
  podeEditar: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setEnviando(true);
    try {
      const blob = await upload(`comercial/${prospectId}/${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/comercial/upload",
      });

      const formData = new FormData();
      formData.set("prospectId", prospectId);
      formData.set("blobUrl", blob.url);
      formData.set("blobPathname", blob.pathname);
      formData.set("nomeArquivo", file.name);
      const resultado = await salvarAnexoComercial(undefined, formData);
      if (resultado?.error) setError(resultado.error);
    } catch {
      setError("Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {anexos.length === 0 ? (
        <p className="text-sm text-foreground/50">Nenhum anexo ainda.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {anexos.map((anexo) => (
            <li key={anexo.id} className="flex items-center justify-between gap-2 text-sm">
              <a href={`/api/comercial/anexos/${anexo.id}`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                {anexo.nome_arquivo}
              </a>
              {podeEditar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="h-7 px-2 text-xs text-danger"
                  loading={removendoId === anexo.id}
                  onClick={() => {
                    setRemovendoId(anexo.id);
                    startTransition(() => {
                      apagarAnexoComercial(anexo.id, prospectId).finally(() => setRemovendoId(null));
                    });
                  }}
                >
                  Remover
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-foreground/50">
            Anexar (PDF, JPG ou PNG)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png"
              onChange={handleFileChange}
              disabled={enviando}
              className="mt-1 block text-sm"
            />
          </label>
          {enviando && <span className="text-xs text-foreground/50">Enviando…</span>}
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
