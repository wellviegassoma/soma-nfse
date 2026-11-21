"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  salvarDocumentoLegalizacao,
  analisarDocumentoLegalizacao,
  apagarBlobOrfao,
} from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";
import { calcularVencimento, descreverRegra, type RegraVencimento } from "@/lib/legalizacao-licencas";

export type DocumentoAtual = {
  numero: string | null;
  orgao: string | null;
  data_emissao: string | null;
  data_vencimento: string | null;
};

const inputClass = "h-9 rounded border border-border bg-surface px-2 text-sm disabled:opacity-40";

export function LegalizacaoDocumentoForm({
  companyId,
  tipoId,
  documentoAtual,
  regra,
}: {
  companyId: string;
  tipoId: string;
  documentoAtual: DocumentoAtual | null;
  regra: Pick<RegraVencimento, "modo" | "dia" | "mes" | "meses" | "municipality_name"> | null;
}) {
  const [pending, setPending] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [avisoCnpj, setAvisoCnpj] = useState<string | null>(null);
  const [numero, setNumero] = useState(documentoAtual?.numero ?? "");
  const [orgao, setOrgao] = useState(documentoAtual?.orgao ?? "");
  const [dataEmissao, setDataEmissao] = useState(documentoAtual?.data_emissao ?? "");
  const [dataVencimento, setDataVencimento] = useState(documentoAtual?.data_vencimento ?? "");
  const [indeterminado, setIndeterminado] = useState(
    documentoAtual != null ? documentoAtual.data_vencimento == null : regra?.modo === "INDETERMINADO",
  );
  const [blobPronto, setBlobPronto] = useState<{ url: string; pathname: string; nome: string } | null>(
    null,
  );

  // Ao mudar a emissão, a regra do município sugere o vencimento — dá pra
  // sobrescrever à mão depois.
  function aplicarRegra(emissao: string) {
    if (!regra) return;
    const sugerido = calcularVencimento(regra, emissao || null);
    if (sugerido === null) {
      setIndeterminado(true);
    } else if (sugerido) {
      setIndeterminado(false);
      setDataVencimento(sugerido);
    }
  }

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
        setDataVencimento(analise.dataVencimentoSugerida);
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

    if (!blobPronto && !documentoAtual) {
      setError("Selecione o arquivo do documento.");
      return;
    }
    if (!indeterminado && !dataVencimento) {
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
        formData.set("dataVencimento", dataVencimento);
      }
      formData.set("numero", numero);
      formData.set("orgao", orgao);
      formData.set("dataEmissao", dataEmissao);
      if (blobPronto) {
        formData.set("blobUrl", blobPronto.url);
        formData.set("blobPathname", blobPronto.pathname);
        formData.set("nomeArquivo", blobPronto.nome);
      }

      const result = await salvarDocumentoLegalizacao(undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setSuccess(true);
        setBlobPronto(null);
        const arquivo = form.elements.namedItem("arquivo") as HTMLInputElement | null;
        if (arquivo) arquivo.value = "";
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
          <label className="text-xs text-foreground/50">Número</label>
          <input
            name="numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className={`${inputClass} w-36`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Órgão emissor</label>
          <input
            name="orgao"
            value={orgao}
            onChange={(e) => setOrgao(e.target.value)}
            placeholder="Ex.: Vigilância Sanitária Municipal"
            className={`${inputClass} w-64`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Emissão</label>
          <input
            name="dataEmissao"
            type="date"
            value={dataEmissao}
            onChange={(e) => {
              setDataEmissao(e.target.value);
              aplicarRegra(e.target.value);
            }}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Vencimento</label>
          <input
            name="dataVencimento"
            type="date"
            value={dataVencimento}
            onChange={(e) => setDataVencimento(e.target.value)}
            disabled={indeterminado}
            className={inputClass}
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
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">
            {documentoAtual ? "Nova licença (PDF, JPG ou PNG) — opcional" : "Arquivo (PDF, JPG ou PNG)"}
          </label>
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
          {documentoAtual && blobPronto ? "Salvar nova licença" : "Salvar"}
        </Button>
        {analisando && <span className="text-xs text-foreground/50">Lendo documento…</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
        {success && <span className="text-xs text-success">Salvo</span>}
      </div>
      <p className="text-xs text-foreground/45">
        {regra
          ? `Regra${regra.municipality_name ? ` de ${regra.municipality_name}` : " padrão"}: ${descreverRegra(regra)}. Preencha a emissão e o vencimento é sugerido.`
          : "Sem regra de vencimento cadastrada para este tipo/município — informe o vencimento à mão."}
        {documentoAtual && " Anexar um arquivo novo guarda a licença atual no histórico."}
      </p>
      {avisoCnpj && <span className="text-xs text-danger">{avisoCnpj}</span>}
    </form>
  );
}
