"use client";

import { useState, useTransition } from "react";
import { deleteCustoFixo } from "@/lib/actions/precificacao";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatarMoeda } from "@/lib/formatters";
import { CustoFixoForm } from "./CustoFixoForm";
import type { PrecificacaoCustoFixo } from "@/lib/types";

export function CustosFixosManager({
  companyId,
  basePath,
  custosFixos,
}: {
  companyId: string;
  basePath: string;
  custosFixos: PrecificacaoCustoFixo[];
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const totalAtivo = custosFixos.filter((c) => c.ativo).reduce((s, c) => s + c.valor_mensal, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">
          Total de custos fixos ativos: <strong className="text-foreground">{formatarMoeda(totalAtivo)}</strong>/mês
        </p>
        {!mostrarNovo && (
          <Button variant="secondary" size="md" onClick={() => setMostrarNovo(true)}>
            + Adicionar custo fixo
          </Button>
        )}
      </div>

      {mostrarNovo && (
        <CustoFixoForm companyId={companyId} basePath={basePath} onCancel={() => setMostrarNovo(false)} />
      )}

      {custosFixos.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum custo fixo cadastrado ainda.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {custosFixos.map((custoFixo) =>
            editandoId === custoFixo.id ? (
              <div key={custoFixo.id} className="p-4">
                <CustoFixoForm
                  companyId={companyId}
                  basePath={basePath}
                  custoFixo={custoFixo}
                  onCancel={() => setEditandoId(null)}
                />
              </div>
            ) : (
              <div key={custoFixo.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {custoFixo.descricao}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    {formatarMoeda(custoFixo.valor_mensal)}/mês
                    {!custoFixo.ativo && " · inativo"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" size="md" onClick={() => setEditandoId(custoFixo.id)}>
                    Editar
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    disabled={pending && pendingDeleteId === custoFixo.id}
                    onClick={() => {
                      setPendingDeleteId(custoFixo.id);
                      startTransition(() => deleteCustoFixo(companyId, custoFixo.id));
                    }}
                  >
                    Excluir
                  </Button>
                </div>
              </div>
            ),
          )}
        </Card>
      )}
    </div>
  );
}
