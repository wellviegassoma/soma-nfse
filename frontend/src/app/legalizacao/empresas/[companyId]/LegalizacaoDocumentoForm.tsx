"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  salvarDocumentoLegalizacao,
  analisarDocumentoLegalizacao,
  apagarBlobOrfao,
} from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";

export function LegalizacaoDocumentoForm({
  companyId,
  tipoId,
  dataVencimentoAtual,
  indeterminadoAtual,
}: {
  companyId: string;
  tipoId: string;
  dataVencimentoAtual: string | null;
  indeterminadoAtual: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null);
  const [indeterminado, setIndeterminado] = useState(indeterminadoAtual);
  const [blobPronto, setBlobPronto] = useState<{ url: string; pathname: string; nome: string } | null>(
    null,
  );

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setAvisoCnpj(null);
    // Se já tinha um upload pronto (arquivo trocado antes de salvar), apaga
    // do Blob pra não ficar órfão — essa troca nunca chegou a virar linha
    // no banco.
    if (blobPronto) {
      apagarBlobOrfao(blobPronto.pathname).catch(() => {});
    }
    setBlobPronto(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalisando(true);
    try {
      const blob = await upload(`legalizacao/${companyId}/${tipoId}-${file.name}`, file, {
        access: "private",
        handleUploadUrl: "/api/legalizacao/upload",
      });
      setBlobPronto({ url: blob.url, pathname: blob.pathname, nome: file.name });

      const analise = await analisarDocumentoLegalizacao(blob.pathname, companyId);
      if (analise.dataVencimentoSugerida && !indeterminado) {
        const form = e.target.form;
        const dataInput = form?.elements.namedItem("dataVencimento") as HTMLInputElement | null;
        if (dataInput) dataInput.value = analise.dataVencimentoSugerida;
      }
      if (analise.cnpjConfere === false) {
        setAvisoCnpj(
          `O CNPJ encontrado no documento (${analise.cnpjEncontrado}) não bate com o CNPJ desta empresa — confira se anexou o arquivo certo.`,
        );
      }
    } catch {
      setError("Não foi possível enviar o arquivo. Tente de novo.");
    } finally {
      setAnalisando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const dataInput = form.elements.namedItem("dataVencimento") as HTMLInputElement;

    if (!blobPronto) {
      setError("Selecione o arquivo do documento.");
      return;
    }
    if (!indeterminado && !dataInput.value) {
      setError("Informe a data de vencimento ou marque validade indeterminada.");
      return;
    }

    setPending(true);
    try {
      const formData = new FormData();
      formData.set("companyId", companyId);
      formData.set("tipoId", tipoId);
      if (indeterminado) {
        formData.set("indeterminado", "on");
      } else {
        formData.set("dataVencimento", dataInput.value);
      }
      formData.set("blobUrl", blobPronto.url);
      formData.set("blobPathname", blobPronto.pathname);
      formData.set("nomeArquivo", blobPronto.nome);

      const result = await salvarDocumentoLegalizacao(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
      }
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Vencimento</label>
          <input
            name="dataVencimento"
            type="date"
            defaultValue={dataVencimentoAtual ?? ""}
            disabled={indeterminado}
            className="h-9 rounded border border-border bg-surface px-2 text-sm disabled:opacity-40"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs text-foreground/70">
          <input
            type="checkbox"
            checked={indeterminado}
            onChange={(e) => setIndeterminado(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Validade indeterminada
        </label>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Arquivo (PDF, JPG ou PNG)</label>
          <input
            name="arquivo"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={handleFileChange}
            className="text-sm"
          />
        </div>
        <Button
          type="submit"
          variant="secondary"
          size="md"
          className="h-9 px-3 text-xs"
          loading={pending}
          disabled={analisando}
        >
          Salvar
        </Button>
        {analisando && <span className="text-xs text-foreground/50">Lendo documento…</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
        {success && <span className="text-xs text-success">Salvo</span>}
      </div>
      {avisoCnpj && <span className="text-xs text-danger">{avisoCnpj}</span>}
    </form>
  );
}
