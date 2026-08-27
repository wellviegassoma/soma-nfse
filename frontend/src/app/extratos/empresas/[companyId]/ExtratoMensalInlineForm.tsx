"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { salvarExtratoMensal, apagarExtratoMensal } from "@/lib/actions/extratos";
import { Button } from "@/components/ui/Button";

export function ExtratoMensalInlineForm({
  companyId,
  contaId,
  competencia,
  entregueAtual,
  conciliadoAtual,
  nomeArquivoAtual,
  extratoId,
}: {
  companyId: string;
  contaId: string;
  competencia: string;
  entregueAtual: boolean;
  conciliadoAtual: boolean;
  nomeArquivoAtual: string | null;
  extratoId: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("arquivo") as HTMLInputElement;
    const entregueInput = form.elements.namedItem("entregue") as HTMLInputElement;
    const conciliadoInput = form.elements.namedItem("conciliado") as HTMLInputElement;
    const file = fileInput.files?.[0];

    setPending(true);
    try {
      const formData = new FormData();
      formData.set("companyId", companyId);
      formData.set("contaId", contaId);
      formData.set("competencia", competencia);
      if (entregueInput.checked) formData.set("entregue", "on");
      if (conciliadoInput.checked) formData.set("conciliado", "on");

      if (file) {
        const blob = await upload(`extratos/${companyId}/${contaId}-${competencia}-${file.name}`, file, {
          access: "private",
          handleUploadUrl: "/api/extratos/upload",
        });
        formData.set("blobUrl", blob.url);
        formData.set("blobPathname", blob.pathname);
        formData.set("nomeArquivo", file.name);
      }

      const result = await salvarExtratoMensal(undefined, formData);
      if (result?.error) setError(result.error);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="entregue"
          defaultChecked={entregueAtual}
          className="h-4 w-4 rounded border-border accent-brand"
        />
        Entregue
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          name="conciliado"
          defaultChecked={conciliadoAtual}
          className="h-4 w-4 rounded border-border accent-brand"
        />
        Conciliado
      </label>
      <input
        name="arquivo"
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="text-xs"
      />
      {nomeArquivoAtual && extratoId && (
        <a
          href={`/api/extratos/mensais/${extratoId}`}
          className="text-xs text-brand underline"
        >
          Baixar {nomeArquivoAtual}
        </a>
      )}
      <Button type="submit" variant="secondary" size="md" className="h-8 px-2 text-xs" loading={pending}>
        Salvar
      </Button>
      {extratoId && (
        <Button
          type="button"
          variant="ghost"
          className="h-8 px-2 text-xs text-danger"
          loading={deleting}
          onClick={() => {
            if (!confirm("Remover este mês?")) return;
            setDeleting(true);
            apagarExtratoMensal(extratoId, companyId).finally(() => setDeleting(false));
          }}
        >
          Apagar
        </Button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </form>
  );
}
