"use client";

import { useState, useRef, useTransition } from "react";
import { salvarFaseTemplate } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Fase = {
  id: string;
  nome: string;
  ordem: number;
  descricao: string | null;
  acao: string | null;
  tipo_documento_id: string | null;
};

export function FaseTemplateForm({
  fluxoId,
  fase,
  tiposDocumento,
  compact,
}: {
  fluxoId: string;
  fase?: Fase;
  tiposDocumento: { id: string; nome: string }[];
  compact?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  if (compact && !editando) {
    return (
      <Button type="button" variant="ghost" size="md" className="h-7 px-2 text-xs" onClick={() => setEditando(true)}>
        Editar
      </Button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const resultado = await salvarFaseTemplate(undefined, formData);
      if (resultado?.error) {
        setError(resultado.error);
        return;
      }
      if (compact) setEditando(false);
      else formRef.current?.reset();
    });
  }

  const suffix = fase?.id ?? "novo";

  return (
    <div className="flex flex-col gap-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <form ref={formRef} onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="fluxoId" value={fluxoId} />
        {fase && <input type="hidden" name="faseId" value={fase.id} />}
        <Field label="Nome" htmlFor={`nome-${suffix}`}>
          <Input id={`nome-${suffix}`} name="nome" defaultValue={fase?.nome} required className="w-64" />
        </Field>
        <Field label="Ordem" htmlFor={`ordem-${suffix}`}>
          <Input id={`ordem-${suffix}`} name="ordem" type="number" defaultValue={fase?.ordem ?? 0} required className="w-20" />
        </Field>
        <Field label="Ação especial" htmlFor={`acao-${suffix}`} hint="Opcional">
          <Select id={`acao-${suffix}`} name="acao" defaultValue={fase?.acao ?? ""} className="w-44">
            <option value="">Nenhuma</option>
            <option value="CRIAR_EMPRESA">Criar empresa</option>
          </Select>
        </Field>
        <Field label="Documento associado" htmlFor={`doc-${suffix}`} hint="Opcional">
          <Select id={`doc-${suffix}`} name="tipoDocumentoId" defaultValue={fase?.tipo_documento_id ?? ""} className="w-52">
            <option value="">Nenhum</option>
            {tiposDocumento.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Descrição" htmlFor={`descricao-${suffix}`} hint="Opcional">
          <Input id={`descricao-${suffix}`} name="descricao" defaultValue={fase?.descricao ?? ""} className="w-64" />
        </Field>
        <Button type="submit" variant="secondary" loading={pending}>
          Salvar
        </Button>
        {compact && (
          <Button type="button" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        )}
      </form>
    </div>
  );
}
