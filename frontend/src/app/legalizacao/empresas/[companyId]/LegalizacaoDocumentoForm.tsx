"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { salvarDocumentoLegalizacao } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function LegalizacaoDocumentoForm({
  companyId,
  tipoId,
  dataVencimentoAtual,
}: {
  companyId: string;
  tipoId: string;
  dataVencimentoAtual: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("arquivo") as HTMLInputElement;
    const dataInput = form.elements.namedItem("dataVencimento") as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!file) {
      setError("Selecione o arquivo do documento.");
      return;
    }
    if (!dataInput.value) {
      setError("Informe a data de vencimento.");
      return;
    }

    setPending(true);
    try {
      const blob = await upload(`legalizacao/${companyId}/${tipoId}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/legalizacao/upload",
      });

      const formData = new FormData();
      formData.set("companyId", companyId);
      formData.set("tipoId", tipoId);
      formData.set("dataVencimento", dataInput.value);
      formData.set("blobUrl", blob.url);
      formData.set("blobPathname", blob.pathname);
      formData.set("nomeArquivo", file.name);

      const result = await salvarDocumentoLegalizacao(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        form.reset();
      }
    } catch {
      setError("Não foi possível enviar o arquivo. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Vencimento</label>
        <input
          name="dataVencimento"
          type="date"
          defaultValue={dataVencimentoAtual ?? ""}
          required
          className="h-9 rounded border border-border bg-surface px-2 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-foreground/50">Arquivo (PDF, JPG ou PNG)</label>
        <input
          name="arquivo"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="text-sm"
        />
      </div>
      <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
        Salvar
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
      {success && <span className="text-xs text-success">Salvo</span>}
    </form>
  );
}
