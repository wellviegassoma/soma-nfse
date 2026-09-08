"use client";

import { useActionState } from "react";
import { baixarAgendamento } from "@/lib/actions/financeiro-lancamentos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import type { AgendamentoTipo } from "@/lib/financeiro";

/**
 * Baixa de um agendamento. O valor vem preenchido com o que está em aberto,
 * mas é editável — baixa parcial é caso comum, não exceção.
 */
export function BaixaForm({
  companyId,
  agendamentoId,
  valorSugerido,
  contas,
  tipo,
}: {
  companyId: string;
  agendamentoId: string;
  valorSugerido: number;
  contas: { id: string; banco: string; agencia: string; conta: string }[];
  tipo: AgendamentoTipo;
}) {
  const [state, formAction, pending] = useActionState(baixarAgendamento, undefined);
  // en-CA dá YYYY-MM-DD no fuso LOCAL. toISOString() seria UTC e sugeriria
  // a data de amanhã pra quem dá baixa à noite.
  const hoje = new Date().toLocaleDateString("en-CA");

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {state?.error && (
        <div className="w-full">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      )}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="agendamentoId" value={agendamentoId} />
      <div className="w-52">
        <Select name="contaId" required defaultValue={contas[0]?.id ?? ""}>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.banco} · {c.agencia}/{c.conta}
            </option>
          ))}
        </Select>
      </div>
      <div className="w-40">
        <Input name="data" type="date" required defaultValue={hoje} aria-label="Data da baixa" />
      </div>
      <div className="w-32">
        <Input
          name="valor"
          type="number"
          step="0.01"
          min="0.01"
          required
          defaultValue={valorSugerido.toFixed(2)}
          aria-label="Valor da baixa"
        />
      </div>
      <Button type="submit" loading={pending}>
        {tipo === "PAGAR" ? "Pagar" : "Receber"}
      </Button>
    </form>
  );
}
