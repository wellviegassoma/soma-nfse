"use client";

import { useActionState, useEffect, useRef } from "react";
import { salvarSenhaCofre } from "@/lib/actions/senhas-cofre";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Senha = {
  id: string;
  servico: string;
  usuario: string | null;
  observacoes: string | null;
};

export function SenhaCofreForm({
  companyId,
  senha,
  onSaved,
}: {
  companyId: string;
  senha?: Senha;
  onSaved?: () => void;
}) {
  const [state, formAction, pending] = useActionState(salvarSenhaCofre, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      if (!senha) formRef.current?.reset();
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      {senha && <input type="hidden" name="senhaId" value={senha.id} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Serviço</label>
          <Input name="servico" placeholder="Ex.: gov.br, ISS, Cremerge..." defaultValue={senha?.servico} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Usuário/login</label>
          <Input name="usuario" placeholder="Opcional" defaultValue={senha?.usuario ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Senha</label>
          <Input
            name="senha"
            type="password"
            placeholder={senha ? "Deixe em branco pra manter" : ""}
            required={!senha}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Observações</label>
          <Input name="observacoes" placeholder="Opcional" defaultValue={senha?.observacoes ?? ""} />
        </div>
      </div>

      <div>
        <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
          {senha ? "Salvar alterações" : "Adicionar senha"}
        </Button>
      </div>
    </form>
  );
}
