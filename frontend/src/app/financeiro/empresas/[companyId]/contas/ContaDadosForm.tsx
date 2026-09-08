"use client";

import { useActionState } from "react";
import { atualizarDadosFinanceirosConta } from "@/lib/actions/financeiro";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { CONTA_TIPO_LABELS, type ContaTipo } from "@/lib/financeiro";

const TIPOS: ContaTipo[] = ["CORRENTE", "POUPANCA", "CAIXA", "APLICACAO"];

/**
 * Só os campos que o Financeiro acrescentou à conta. Banco, agência e número
 * seguem no módulo Extratos, que é o dono do cadastro.
 */
export function ContaDadosForm({
  companyId,
  conta,
}: {
  companyId: string;
  conta: {
    id: string;
    tipo: ContaTipo;
    saldo_inicial: number;
    data_saldo_inicial: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    atualizarDadosFinanceirosConta,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {state?.error && (
        <div className="w-full">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      )}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="contaId" value={conta.id} />
      <label className="flex flex-col gap-1 text-xs text-foreground/60">
        Tipo
        <div className="w-40">
          <Select name="tipo" defaultValue={conta.tipo}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {CONTA_TIPO_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground/60">
        Saldo inicial
        <div className="w-32">
          <Input
            name="saldoInicial"
            type="number"
            step="0.01"
            defaultValue={Number(conta.saldo_inicial).toFixed(2)}
          />
        </div>
      </label>
      <label className="flex flex-col gap-1 text-xs text-foreground/60">
        Data do saldo
        <div className="w-40">
          <Input
            name="dataSaldoInicial"
            type="date"
            defaultValue={conta.data_saldo_inicial ?? ""}
          />
        </div>
      </label>
      <Button type="submit" variant="secondary" loading={pending}>
        Salvar
      </Button>
    </form>
  );
}
