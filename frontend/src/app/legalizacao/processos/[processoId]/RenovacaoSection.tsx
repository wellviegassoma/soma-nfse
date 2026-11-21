"use client";

import { useActionState, useRef, useTransition } from "react";
import Link from "next/link";
import {
  adicionarRequisito,
  marcarRequisito,
  removerRequisito,
  salvarDadosRenovacao,
} from "@/lib/actions/legalizacao-renovacoes";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

export type DadosRenovacao = {
  processoId: string;
  companyId: string;
  licencaTipoNome: string;
  licencaVencimento: string | null; // vencimento quando a renovação abriu
  licencaAtualVencimento: string | null; // vencimento da licença vigente hoje
  protocolo_numero: string | null;
  protocolo_data: string | null;
  guia_valor: number | null;
  guia_vencimento: string | null;
};

export type Requisito = { id: string; item: string; recebido_em: string | null };

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

export function RenovacaoSection({
  dados,
  requisitos,
  podeEditar,
}: {
  dados: DadosRenovacao;
  requisitos: Requisito[];
  podeEditar: boolean;
}) {
  const [state, formAction, salvando] = useActionState(salvarDadosRenovacao, undefined);
  const [pending, startTransition] = useTransition();
  const novoItemRef = useRef<HTMLInputElement>(null);
  const recebidos = requisitos.filter((r) => r.recebido_em).length;
  const renovada =
    dados.licencaAtualVencimento != null &&
    dados.licencaVencimento != null &&
    dados.licencaAtualVencimento > dados.licencaVencimento;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-surface-muted/40 p-4 text-sm">
          <div className="font-semibold text-foreground">{dados.licencaTipoNome}</div>
          <div className="mt-1 text-foreground/70">
            Vencimento quando a renovação abriu: <strong>{br(dados.licencaVencimento)}</strong>
          </div>
          <div className="text-foreground/70">
            Licença vigente hoje vence em: <strong>{br(dados.licencaAtualVencimento)}</strong>
            {renovada && <span className="ml-2 font-medium text-success">já renovada</span>}
          </div>
          <Link
            href={`/legalizacao/empresas/${dados.companyId}/gerenciar`}
            className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
          >
            Anexar a licença nova →
          </Link>
        </div>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="processoId" value={dados.processoId} />
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          {state?.success && <Alert tone="success">Dados salvos.</Alert>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nº do protocolo" htmlFor="protocoloNumero">
              <Input
                id="protocoloNumero"
                name="protocoloNumero"
                defaultValue={dados.protocolo_numero ?? ""}
                disabled={!podeEditar}
                placeholder="Ex.: 000911/2026"
              />
            </Field>
            <Field label="Data do protocolo" htmlFor="protocoloData">
              <Input
                id="protocoloData"
                name="protocoloData"
                type="date"
                defaultValue={dados.protocolo_data ?? ""}
                disabled={!podeEditar}
              />
            </Field>
            <Field label="Valor da guia (R$)" htmlFor="guiaValor">
              <Input
                id="guiaValor"
                name="guiaValor"
                inputMode="decimal"
                defaultValue={
                  dados.guia_valor != null
                    ? dados.guia_valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
                    : ""
                }
                disabled={!podeEditar}
              />
            </Field>
            <Field label="Vencimento da guia" htmlFor="guiaVencimento">
              <Input
                id="guiaVencimento"
                name="guiaVencimento"
                type="date"
                defaultValue={dados.guia_vencimento ?? ""}
                disabled={!podeEditar}
              />
            </Field>
          </div>
          {podeEditar && (
            <div>
              <Button type="submit" variant="secondary" loading={salvando}>
                Salvar protocolo e guia
              </Button>
            </div>
          )}
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-sm font-medium text-foreground/70">
          Documentos ({recebidos}/{requisitos.length} recebidos)
        </div>
        {requisitos.length === 0 ? (
          <p className="text-sm text-foreground/50">
            Nenhum documento cadastrado para este tipo/município. Adicione abaixo o que o órgão pede.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {requisitos.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(r.recebido_em)}
                    disabled={!podeEditar || pending}
                    onChange={(e) =>
                      startTransition(() => marcarRequisito(r.id, dados.processoId, e.target.checked))
                    }
                    className="h-4 w-4 accent-brand"
                  />
                  <span className={r.recebido_em ? "text-foreground/50 line-through" : "text-foreground"}>
                    {r.item}
                  </span>
                </label>
                {podeEditar && (
                  <button
                    type="button"
                    className="text-xs text-foreground/40 hover:text-danger"
                    onClick={() => startTransition(() => removerRequisito(r.id, dados.processoId))}
                  >
                    remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {podeEditar && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const item = novoItemRef.current?.value ?? "";
              startTransition(async () => {
                await adicionarRequisito(dados.processoId, item);
                if (novoItemRef.current) novoItemRef.current.value = "";
              });
            }}
          >
            <Input ref={novoItemRef} placeholder="Adicionar documento pedido pelo órgão..." />
            <Button type="submit" variant="secondary" loading={pending}>
              Adicionar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
