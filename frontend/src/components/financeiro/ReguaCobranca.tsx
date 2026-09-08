"use client";

import { useActionState, useState } from "react";
import {
  salvarEtapaCobranca,
  alternarEtapaAtiva,
} from "@/lib/actions/financeiro-cobranca";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { CANAIS, CANAL_LABELS } from "@/lib/financeiro-cobranca";

type EtapaView = {
  id: string;
  nome: string;
  diasRelativos: number;
  canal: string;
  canalLabel: string;
  template: string;
  ativa: boolean;
};

function rotuloDias(d: number): string {
  if (d < 0) return `${Math.abs(d)} dia(s) antes do vencimento`;
  if (d === 0) return "no dia do vencimento";
  return `${d} dia(s) de atraso`;
}

export function ReguaCobranca({
  companyId,
  etapas,
}: {
  companyId: string;
  etapas: EtapaView[];
}) {
  const [state, formAction, pending] = useActionState(salvarEtapaCobranca, undefined);
  const [, toggleAction] = useActionState(alternarEtapaAtiva, undefined);
  const [aberto, setAberto] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">Régua de cobrança</h2>
          <p className="mt-0.5 text-xs text-foreground/55">
            {etapas.filter((e) => e.ativa).length} etapa(s) ativa(s). A régua só anda pra
            frente: depois do aviso de 7 dias ela não volta pro de 3.
          </p>
        </div>
        <span className="shrink-0 text-sm text-brand">{aberto ? "Ocultar" : "Ver e editar"}</span>
      </button>

      {aberto && (
        <>
          <ul className="divide-y divide-border border-t border-border">
            {etapas.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {e.nome}
                    {!e.ativa && (
                      <span className="ml-2 text-xs text-foreground/40">inativa</span>
                    )}
                  </p>
                  <p className="text-xs text-foreground/55">
                    {rotuloDias(e.diasRelativos)} · {e.canalLabel}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/45">
                    {e.template}
                  </p>
                </div>
                <form action={toggleAction} className="shrink-0">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="etapaId" value={e.id} />
                  <input type="hidden" name="ativa" value={e.ativa ? "false" : "true"} />
                  <Button type="submit" variant="secondary">
                    {e.ativa ? "Desativar" : "Ativar"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>

          <form
            key={state?.at ?? 0}
            action={formAction}
            className="flex flex-col gap-4 border-t border-border px-5 py-4"
          >
            {state?.error && <Alert tone="danger">{state.error}</Alert>}
            <p className="text-xs font-medium text-foreground/70">Nova etapa</p>
            <input type="hidden" name="companyId" value={companyId} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nome" htmlFor="nomeEtapa">
                <Input id="nomeEtapa" name="nome" required placeholder="Ex.: Aviso de 45 dias" />
              </Field>
              <Field
                label="Dias"
                htmlFor="diasRelativos"
                hint="Negativo = antes do vencimento. 0 = no dia."
              >
                <Input
                  id="diasRelativos"
                  name="diasRelativos"
                  type="number"
                  required
                  defaultValue="45"
                />
              </Field>
              <Field label="Canal" htmlFor="canalEtapa">
                <Select id="canalEtapa" name="canal" defaultValue="EMAIL">
                  {CANAIS.map((c) => (
                    <option key={c} value={c}>
                      {CANAL_LABELS[c]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Mensagem"
              htmlFor="template"
              hint="Use {cliente}, {valor}, {vencimento}, {descricao}, {dias_atraso} e {empresa}."
            >
              <textarea
                id="template"
                name="template"
                required
                rows={3}
                className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
                placeholder="Olá, {cliente}. {descricao} está em aberto desde {vencimento}..."
              />
            </Field>
            <div>
              <Button type="submit" variant="secondary" loading={pending}>
                Adicionar etapa
              </Button>
            </div>
          </form>
        </>
      )}
    </Card>
  );
}
