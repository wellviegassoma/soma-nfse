"use client";

import { useActionState } from "react";
import { salvarOrcamento, copiarOrcamento } from "@/lib/actions/financeiro-orcamento";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";
import { formatarBRL } from "@/lib/financeiro";

type Grupo = {
  grupo: string;
  rotulo: string;
  categorias: { id: string; nome: string; valor: number | null }[];
};

export function OrcamentoForm({
  companyId,
  competencia,
  anterior,
  grupos,
}: {
  companyId: string;
  competencia: string;
  anterior: string;
  grupos: Grupo[];
}) {
  const [state, salvarAction, salvando] = useActionState(salvarOrcamento, undefined);
  const [stateCopia, copiarAction, copiando] = useActionState(copiarOrcamento, undefined);

  const totalPorGrupo = (g: Grupo) =>
    g.categorias.reduce((s, c) => s + (c.valor ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.sucesso && <Alert tone="success">{state.sucesso}</Alert>}
      {stateCopia?.error && <Alert tone="danger">{stateCopia.error}</Alert>}
      {stateCopia?.sucesso && <Alert tone="success">{stateCopia.sucesso}</Alert>}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-foreground/70">
          Começar a partir do mês anterior é mais rápido que digitar tudo de novo.
        </p>
        <form action={copiarAction}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="origem" value={anterior} />
          <input type="hidden" name="destino" value={competencia} />
          <Button type="submit" variant="secondary" loading={copiando}>
            Copiar de {anterior}
          </Button>
        </form>
      </Card>

      {/* key remonta os campos depois de salvar/copiar, pra os valores
          refletirem o que o servidor devolveu e não o que ficou digitado. */}
      <form key={state?.at ?? stateCopia?.at ?? 0} action={salvarAction}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="competencia" value={competencia} />

        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <Card key={g.grupo}>
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                  {g.rotulo}
                </h2>
                <span className="text-xs text-foreground/55">
                  {formatarBRL(totalPorGrupo(g))}
                </span>
              </div>
              <ul className="divide-y divide-border">
                {g.categorias.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-4 px-5 py-2.5"
                  >
                    <label
                      htmlFor={`valor_${c.id}`}
                      className="min-w-0 truncate text-sm text-foreground/80"
                    >
                      {c.nome}
                    </label>
                    <div className="w-36 shrink-0">
                      <Input
                        id={`valor_${c.id}`}
                        name={`valor_${c.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={c.valor ?? ""}
                        placeholder="—"
                        className="text-right"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="mt-4">
          <Button type="submit" loading={salvando}>
            Salvar orçamento de {competencia}
          </Button>
          <p className="mt-2 text-xs text-foreground/55">
            Campo vazio ou zero remove a linha — &quot;não orçado&quot; e &quot;orçado
            zero&quot; contam diferente no comparativo.
          </p>
        </div>
      </form>
    </div>
  );
}
