"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarSocio, atualizarSocio } from "@/lib/actions/societario";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Socio = {
  id: string;
  tipo_pessoa: "PF" | "PJ";
  nome: string;
  documento: string | null;
  percentual_participacao: number | null;
  data_entrada: string | null;
  data_saida: string | null;
};

export function SocioForm({
  companyId,
  socio,
  onSaved,
}: {
  companyId: string;
  socio?: Socio;
  onSaved?: () => void;
}) {
  const action = socio ? atualizarSocio : criarSocio;
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      if (!socio) formRef.current?.reset();
      onSaved?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="companyId" value={companyId} />
      {socio && <input type="hidden" name="socioId" value={socio.id} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Tipo</label>
          <Select name="tipoPessoa" defaultValue={socio?.tipo_pessoa ?? "PF"} required>
            <option value="PF">Pessoa Física</option>
            <option value="PJ">Pessoa Jurídica</option>
          </Select>
        </div>
        <div className="col-span-2 flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs text-foreground/50">Nome / Razão social</label>
          <Input name="nome" defaultValue={socio?.nome} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">CPF/CNPJ</label>
          <Input name="documento" defaultValue={socio?.documento ?? ""} placeholder="Opcional" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Participação (%)</label>
          <Input
            name="percentualParticipacao"
            type="number"
            step="0.01"
            min="0"
            max="100"
            defaultValue={socio?.percentual_participacao ?? ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Data de entrada</label>
          <Input name="dataEntrada" type="date" defaultValue={socio?.data_entrada ?? ""} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground/50">Data de saída</label>
          <Input name="dataSaida" type="date" defaultValue={socio?.data_saida ?? ""} />
        </div>
      </div>

      <div>
        <Button type="submit" variant="secondary" size="md" className="h-9 px-3 text-xs" loading={pending}>
          {socio ? "Salvar alterações" : "Adicionar sócio"}
        </Button>
      </div>
    </form>
  );
}
