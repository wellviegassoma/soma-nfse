"use client";

import { useActionState, useState } from "react";
import { tratarMensagem, type TratamentoState } from "@/lib/actions/caixa-postal";
import type { StatusTratamento } from "@/lib/caixa-postal-core";

type Pessoa = { id: string; nome: string };

const botao =
  "h-8 rounded-md border px-2.5 text-xs font-medium disabled:opacity-50";

export function TratamentoMensagem({
  mensagemId,
  status,
  responsavelId,
  equipe,
}: {
  mensagemId: string;
  status: StatusTratamento;
  responsavelId: string | null;
  equipe: Pessoa[];
}) {
  const [estado, acao, pendente] = useActionState<TratamentoState, FormData>(tratarMensagem, undefined);
  const [nota, setNota] = useState(false);

  return (
    <form action={acao} className="flex w-full flex-col gap-2 lg:w-[360px]">
      <input type="hidden" name="mensagemId" value={mensagemId} />
      <div className="flex flex-wrap items-center gap-2">
        {status === "nova" && (
          <button name="acao" value="assumir" disabled={pendente} className={`${botao} border-brand bg-brand text-brand-foreground`}>
            Assumir
          </button>
        )}
        {status !== "resolvida" && (
          <>
            <select
              key={responsavelId ?? "nenhum"}
              name="responsavelId"
              defaultValue={responsavelId ?? ""}
              aria-label="Responsável"
              className="h-8 max-w-[170px] rounded-md border border-border bg-surface px-2 text-xs"
            >
              <option value="">Sem responsável</option>
              {equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <button name="acao" value="atribuir" disabled={pendente} className={`${botao} border-border hover:bg-surface-muted`}>
              Atribuir
            </button>
          </>
        )}
        <button type="button" onClick={() => setNota((v) => !v)} className={`${botao} border-border hover:bg-surface-muted`}>
          {status === "resolvida" ? "Reabrir…" : "Resolver / anotar…"}
        </button>
      </div>
      {nota && (
        <div className="flex flex-col gap-2">
          <textarea
            name="observacao"
            rows={2}
            maxLength={2000}
            placeholder="O que foi feito? Ex.: respondida no e-CAC em 20/11, DARF pago, sem ação necessária…"
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex gap-2">
            {status !== "resolvida" ? (
              <>
                <button name="acao" value="resolver" disabled={pendente} className={`${botao} border-success bg-success text-white`}>
                  Marcar resolvida
                </button>
                <button name="acao" value="anotar" disabled={pendente} className={`${botao} border-border hover:bg-surface-muted`}>
                  Só anotar
                </button>
              </>
            ) : (
              <button name="acao" value="reabrir" disabled={pendente} className={`${botao} border-warning text-warning`}>
                Reabrir
              </button>
            )}
          </div>
        </div>
      )}
      {estado?.error && <p className="text-xs text-danger">{estado.error}</p>}
      {estado?.ok && <p className="text-xs text-success">{estado.ok}</p>}
    </form>
  );
}
