"use client";

import { useActionState, useState } from "react";
import { enviarWhatsappRenovacao } from "@/lib/actions/legalizacao-renovacoes";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

const FASE_GUIA_ENVIADA = "Guia enviada ao cliente";

export function WhatsappRenovacao({
  processoId,
  grupos,
  anexos,
  mensagens,
  faseGuiaPendente,
  temPendentes,
}: {
  processoId: string;
  grupos: { contactId: string; nome: string }[];
  anexos: { id: string; nome_arquivo: string }[];
  mensagens: { guia: string; documentos: string };
  faseGuiaPendente: boolean;
  temPendentes: boolean;
}) {
  const [state, formAction, enviando] = useActionState(enviarWhatsappRenovacao, undefined);
  const [modo, setModo] = useState<"guia" | "documentos">("guia");
  const [texto, setTexto] = useState(mensagens.guia);
  const [anexoId, setAnexoId] = useState(anexos[0]?.id ?? "");
  const [contactId, setContactId] = useState(grupos[0]?.contactId ?? "");

  if (grupos.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        Esta empresa não tem grupo do WhatsApp vinculado. Vincule em Dados fiscais → “Grupos do WhatsApp” (ou
        pelo painel de pedidos de nota) para enviar a guia por aqui.
      </p>
    );
  }

  function trocarModo(m: "guia" | "documentos") {
    setModo(m);
    setTexto(m === "guia" ? mensagens.guia : mensagens.documentos);
  }

  const grupoNome = grupos.find((g) => g.contactId === contactId)?.nome ?? "";

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`Enviar esta mensagem para "${grupoNome}" no WhatsApp?`)) e.preventDefault();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="processoId" value={processoId} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">{state.success}</Alert>}

      <div className="flex gap-1">
        {(
          [
            ["guia", "Enviar guia"],
            ["documentos", "Cobrar documentos"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => trocarModo(m)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              modo === m ? "bg-foreground text-background" : "bg-surface-muted text-foreground/70 hover:bg-surface-muted/70",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Grupo do WhatsApp" htmlFor="contactId">
          <Select id="contactId" name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            {grupos.map((g) => (
              <option key={g.contactId} value={g.contactId}>
                {g.nome}
              </option>
            ))}
          </Select>
        </Field>
        {modo === "guia" && (
          <Field
            label="Arquivo da guia"
            htmlFor="anexoId"
            hint={anexos.length === 0 ? "Anexe o PDF da guia em “Anexos” deste processo." : undefined}
          >
            <Select id="anexoId" name="anexoId" value={anexoId} onChange={(e) => setAnexoId(e.target.value)}>
              <option value="">Sem arquivo (só a mensagem)</option>
              {anexos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome_arquivo}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {modo === "documentos" && !temPendentes && (
        <p className="text-xs text-foreground/50">Todos os documentos do checklist já foram recebidos.</p>
      )}

      <Field label="Mensagem" htmlFor="texto" hint="Pode editar antes de enviar. *texto* sai em negrito no WhatsApp.">
        <textarea
          id="texto"
          name="texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={9}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </Field>

      {modo === "guia" && faseGuiaPendente && (
        <label className="flex items-center gap-2 text-xs text-foreground/70">
          <input type="checkbox" name="concluirFase" value={FASE_GUIA_ENVIADA} defaultChecked className="h-4 w-4 accent-brand" />
          Concluir a etapa “{FASE_GUIA_ENVIADA}” ao enviar
        </label>
      )}

      <div>
        <Button type="submit" loading={enviando}>
          Enviar pelo WhatsApp
        </Button>
      </div>
    </form>
  );
}
