"use client";

import { useActionState, useEffect, useRef } from "react";
import { salvarContatoSetor } from "@/lib/actions/contatos-setor";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const SETORES_SUGERIDOS = ["Pessoal", "Fiscal", "Financeiro", "Societário", "Diretoria"];

type ContatoSetor = {
  id: string;
  setor: string;
  nome: string | null;
  telefone: string | null;
  email: string | null;
};

export function ContatoSetorForm({
  companyId,
  contato,
  onSaved,
}: {
  companyId: string;
  contato?: ContatoSetor;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(salvarContatoSetor, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      if (!contato) formRef.current?.reset();
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      {contato && <input type="hidden" name="contatoId" value={contato.id} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Setor</label>
          <Input
            name="setor"
            list="setores-sugeridos"
            placeholder="Ex.: Pessoal"
            defaultValue={contato?.setor}
            required
          />
          <datalist id="setores-sugeridos">
            {SETORES_SUGERIDOS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Nome</label>
          <Input name="nome" placeholder="Opcional" defaultValue={contato?.nome ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Telefone</label>
          <Input name="telefone" placeholder="Opcional" defaultValue={contato?.telefone ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">E-mail</label>
          <Input name="email" type="email" placeholder="Opcional" defaultValue={contato?.email ?? ""} />
        </div>
      </div>

      <div>
        <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
          {contato ? "Salvar alterações" : "Adicionar contato"}
        </Button>
      </div>
    </form>
  );
}
