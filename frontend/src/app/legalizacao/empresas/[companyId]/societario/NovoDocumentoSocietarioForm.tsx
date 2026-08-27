"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { salvarDocumentoSocietario } from "@/lib/actions/societario";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function NovoDocumentoSocietarioForm({ companyId }: { companyId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const dataDocumento = (form.elements.namedItem("dataDocumento") as HTMLInputElement).value;
    const descricao = (form.elements.namedItem("descricao") as HTMLInputElement).value;
    const file = (form.elements.namedItem("arquivo") as HTMLInputElement).files?.[0];

    if (!file) {
      setError("Selecione o arquivo do documento.");
      return;
    }

    setPending(true);
    try {
      const blob = await upload(`societario/${companyId}/${Date.now()}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/legalizacao/upload",
      });

      const formData = new FormData();
      formData.set("companyId", companyId);
      formData.set("dataDocumento", dataDocumento);
      formData.set("descricao", descricao);
      formData.set("blobUrl", blob.url);
      formData.set("blobPathname", blob.pathname);
      formData.set("nomeArquivo", file.name);

      const result = await salvarDocumentoSocietario(undefined, formData);
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
    <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Data</label>
        <Input name="dataDocumento" type="date" required className="w-40" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Descrição</label>
        <Input
          name="descricao"
          placeholder="Ex.: Contrato Social, 2ª Alteração..."
          required
          className="w-72"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Arquivo (PDF, JPG ou PNG)</label>
        <input name="arquivo" type="file" accept="application/pdf,image/jpeg,image/png" className="text-sm" />
      </div>
      <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
        Adicionar
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}
