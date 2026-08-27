"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SocioForm } from "./SocioForm";
import { DeleteSocioButton } from "./DeleteSocioButton";
import { DocumentoSocioForm } from "./DocumentoSocioForm";
import { DeleteDocumentoSocioButton } from "./DeleteDocumentoSocioButton";

type DocumentoSocio = { id: string; descricao: string; nome_arquivo: string };
type Socio = {
  id: string;
  tipo_pessoa: "PF" | "PJ";
  nome: string;
  documento: string | null;
  percentual_participacao: number | null;
  data_entrada: string | null;
  data_saida: string | null;
  documentos: DocumentoSocio[];
};

function formatarDocumento(documento: string | null, tipo: "PF" | "PJ"): string | null {
  if (!documento) return null;
  if (tipo === "PJ" && documento.length === 14) {
    return documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (documento.length === 11) {
    return documento.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return documento;
}

export function SociosList({ companyId, socios }: { companyId: string; socios: Socio[] }) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {socios.map((socio) => (
        <Card key={socio.id} className="overflow-hidden">
          {editandoId === socio.id ? (
            <div className="p-4">
              <SocioForm companyId={companyId} socio={socio} onSaved={() => setEditandoId(null)} />
              <button
                type="button"
                className="mt-2 text-xs text-foreground/50 underline"
                onClick={() => setEditandoId(null)}
              >
                Cancelar edição
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-foreground">
                  {socio.nome}
                  {socio.data_saida && (
                    <span className="ml-2 text-xs font-normal text-foreground/40">(saiu)</span>
                  )}
                </div>
                <div className="text-xs text-foreground/50">
                  {socio.tipo_pessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
                  {formatarDocumento(socio.documento, socio.tipo_pessoa) &&
                    ` · ${formatarDocumento(socio.documento, socio.tipo_pessoa)}`}
                  {socio.percentual_participacao != null && ` · ${socio.percentual_participacao}%`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setExpandidoId(expandidoId === socio.id ? null : socio.id)}
                >
                  Documentos ({socio.documentos.length})
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="md"
                  className="h-8 px-2.5 text-xs"
                  onClick={() => setEditandoId(socio.id)}
                >
                  Editar
                </Button>
                <DeleteSocioButton socioId={socio.id} companyId={companyId} />
              </div>
            </div>
          )}

          {expandidoId === socio.id && editandoId !== socio.id && (
            <div className="flex flex-col gap-2 border-t border-border bg-surface-muted/40 p-4">
              {socio.documentos.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between gap-3 text-xs">
                  <a
                    href={`/api/societario/socios-documentos/${doc.id}`}
                    className="text-brand underline"
                  >
                    {doc.descricao} — {doc.nome_arquivo}
                  </a>
                  <DeleteDocumentoSocioButton documentoId={doc.id} companyId={companyId} />
                </div>
              ))}
              <DocumentoSocioForm socioId={socio.id} companyId={companyId} />
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
