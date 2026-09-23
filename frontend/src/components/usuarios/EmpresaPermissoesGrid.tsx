"use client";

import { useState, useTransition } from "react";
import { PERMISSOES, marcarComCascata, desmarcarComCascata, type Permissao } from "@/lib/permissoes/catalogo";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";

// Autoatendimento — sem seção global, sem trocar de empresa: só as
// permissões que o próprio usuário logado já tem nessa empresa aparecem
// como opção (a RPC recusaria o resto de qualquer forma).
export function EmpresaPermissoesGrid({
  permissoesDisponiveis,
  permissoesIniciais,
  onSalvar,
}: {
  permissoesDisponiveis: Permissao[];
  permissoesIniciais: Permissao[];
  onSalvar: (permissoes: Permissao[]) => Promise<{ error?: string; success?: boolean; userId?: string }>;
}) {
  const [selecionadas, setSelecionadas] = useState<Set<Permissao>>(new Set(permissoesIniciais));
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ error?: string; success?: boolean } | null>(null);

  function alternar(chave: Permissao) {
    setResultado(null);
    setSelecionadas((atual) =>
      atual.has(chave) ? desmarcarComCascata(atual, chave) : marcarComCascata(atual, chave),
    );
  }

  function salvar() {
    setResultado(null);
    startTransition(async () => {
      const resposta = await onSalvar([...selecionadas]);
      setResultado(resposta);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {resultado?.error && <Alert tone="danger">{resultado.error}</Alert>}
      {resultado?.success && <Alert tone="success">Salvo.</Alert>}

      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {permissoesDisponiveis.map((chave) => {
          const info = PERMISSOES[chave];
          const checked = selecionadas.has(chave);
          return (
            <label
              key={chave}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-surface-muted",
                info.irreversivel && checked && "bg-danger-soft/40",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => alternar(chave)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
              />
              <span>
                <span className={cn("block font-medium text-foreground", info.irreversivel && "text-danger")}>
                  {info.label}
                  {info.irreversivel && " ⚠"}
                </span>
                <span className="block text-xs text-foreground/50">{info.descricao}</span>
              </span>
            </label>
          );
        })}
      </div>

      <div>
        <Button type="button" loading={pending} onClick={salvar}>
          Salvar acesso
        </Button>
      </div>
    </div>
  );
}
