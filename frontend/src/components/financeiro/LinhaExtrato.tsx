"use client";

import { useActionState } from "react";
import {
  conciliarComAgendamento,
  alternarIgnorarLinha,
} from "@/lib/actions/financeiro-extrato";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { formatarBRL, formatarDataBr } from "@/lib/financeiro";

type Sugestao = {
  id: string;
  descricao: string | null;
  vencimento: string;
  emAberto: number;
  distancia: number;
};

/**
 * Uma linha do extrato pendente, com as sugestões de conciliação ao lado.
 * A sugestão nunca é aplicada sozinha: conciliação errada suja o saldo e a
 * contabilidade ao mesmo tempo, e desfazer depois é bem mais caro do que
 * clicar agora.
 */
export function LinhaExtrato({
  companyId,
  linha,
  sugestoes,
}: {
  companyId: string;
  linha: {
    id: string;
    data: string;
    descricao: string;
    documento: string | null;
    valor: number;
    origem: string;
  };
  sugestoes: Sugestao[];
}) {
  const [state, conciliarAction, conciliando] = useActionState(
    conciliarComAgendamento,
    undefined,
  );
  const [, ignorarAction, ignorando] = useActionState(alternarIgnorarLinha, undefined);

  const saiu = Number(linha.valor) < 0;

  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{linha.descricao}</p>
          <p className="mt-0.5 text-xs text-foreground/55">
            {formatarDataBr(linha.data)} · {linha.origem}
            {linha.documento && ` · doc ${linha.documento}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-sm font-semibold ${saiu ? "text-danger" : "text-success"}`}
          >
            {formatarBRL(linha.valor)}
          </p>
          <p className="text-xs text-foreground/45">{saiu ? "saiu" : "entrou"}</p>
        </div>
      </div>

      {sugestoes.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/40 p-3">
          <p className="text-xs font-medium text-foreground/70">
            {sugestoes.length === 1 ? "Sugestão" : "Sugestões"} — confira antes de confirmar
          </p>
          {sugestoes.map((s) => (
            <form
              key={s.id}
              action={conciliarAction}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <input type="hidden" name="companyId" value={companyId} />
              <input type="hidden" name="linhaId" value={linha.id} />
              <input type="hidden" name="agendamentoId" value={s.id} />
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">
                  {s.descricao || "Sem descrição"}
                </p>
                <p className="text-xs text-foreground/55">
                  vence {formatarDataBr(s.vencimento)} · {formatarBRL(s.emAberto)} em aberto
                  {s.distancia === 0
                    ? " · mesma data"
                    : ` · ${s.distancia} dia(s) de diferença`}
                </p>
              </div>
              <Button type="submit" loading={conciliando}>
                Conciliar
              </Button>
            </form>
          ))}
        </div>
      ) : (
        <p className="text-xs text-foreground/50">
          Nenhum agendamento em aberto com esse valor e data próxima. Agende a conta em
          &quot;{saiu ? "Contas a pagar" : "Contas a receber"}&quot; e volte aqui, ou ignore a
          linha se ela já foi tratada de outro jeito.
        </p>
      )}

      <form action={ignorarAction} className="self-start">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="linhaId" value={linha.id} />
        <input type="hidden" name="ignorar" value="true" />
        <Button type="submit" variant="ghost" loading={ignorando}>
          Ignorar esta linha
        </Button>
      </form>
    </div>
  );
}
