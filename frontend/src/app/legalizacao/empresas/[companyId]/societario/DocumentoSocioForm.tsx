"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { salvarDocumentoSocio } from "@/lib/actions/societario";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function DocumentoSocioForm({ socioId, companyId }: { socioId: string; companyId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const descricao = (form.elements.namedItem("descricao") as HTMLInputElement).value;
    const file = (form.elements.namedItem("arquivo") as HTMLInputElement).files?.[0];

    if (!file) {
      setError("Selecione o arquivo do documento.");
      return;
    }

    setPending(true);
    try {
      const blob = await upload(`socios/${socioId}/${Date.now()}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/legalizacao/upload",
      });

      const formData = new FormData();
      formData.set("socioId", socioId);
      formData.set("companyId", companyId);
      formData.set("descricao", descricao);
      formData.set("blobUrl", blob.url);
      formData.set("blobPathname", blob.pathname);
      formData.set("nomeArquivo", file.name);

      const result = await salvarDocumentoSocio(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        formRef.current?.reset();
      }
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <Input name="descricao" placeholder="Ex.: RG, CPF, comprovante..." required className="h-8 w-52 text-xs" />
      <input name="arquivo" type="file" accept="application/pdf,image/jpeg,image/png" className="text-xs" />
      <Button type="submit" variant="secondary" size="md" className="h-8 px-2 text-xs" loading={pending}>
        Adicionar
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}
