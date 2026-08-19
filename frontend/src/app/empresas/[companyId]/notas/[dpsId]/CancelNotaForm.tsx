"use client";

import { useActionState, useState } from "react";
import { cancelarNfse } from "@/lib/actions/notas";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";

const MOTIVOS: Record<string, string> = {
  "1": "Erro na emissão",
  "2": "Serviço não prestado",
  "9": "Outros",
};

export function CancelNotaForm({
  companyId,
  dpsId,
}: {
  companyId: string;
  dpsId: string;
}) {
  const [state, formAction, pending] = useActionState(cancelarNfse, undefined);
  const [open, setOpen] = useState(false);
  const [confirmado, setConfirmado] = useState(false);

  if (state?.success) {
    return <Alert tone="success">Nota cancelada. O status já foi atualizado.</Alert>;
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Cancelar nota
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border border-danger/30 bg-danger/5 p-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="dpsId" value={dpsId} />

      <Alert tone="warning">
        Cancelamento é uma ação real registrada no Sefin Nacional. Essa funcionalidade ainda
        não foi validada contra nenhum cancelamento real aceito — confira o resultado com
        atenção depois de enviar.
      </Alert>

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Motivo" htmlFor="motivoCodigo">
        <Select id="motivoCodigo" name="motivoCodigo" defaultValue="1" required>
          {Object.entries(MOTIVOS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Descreva o motivo (mín. 15 caracteres)" htmlFor="motivoDescricao">
        <textarea
          id="motivoDescricao"
          name="motivoDescricao"
          rows={3}
          maxLength={255}
          minLength={15}
          required
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground placeholder:text-foreground/40 outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
          placeholder="Ex.: Nota emitida por engano, valor e tomador incorretos."
        />
      </Field>

      <label className="flex items-start gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
        />
        Confirmo que quero cancelar esta NFS-e. Sei que essa ação é enviada ao Sefin
        Nacional e não pode ser desfeita pelo sistema.
      </label>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="danger" loading={pending} disabled={!confirmado}>
          Confirmar cancelamento
        </Button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm font-medium text-foreground/60 hover:underline"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
