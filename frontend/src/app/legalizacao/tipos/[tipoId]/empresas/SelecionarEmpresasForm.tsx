"use client";

import { useMemo, useState, useTransition } from "react";
import { definirEmpresasAplicaveisDoTipo } from "@/lib/actions/legalizacao";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Empresa = { id: string; nome: string };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function SelecionarEmpresasForm({
  tipoId,
  empresas,
  empresasAplicaveisIds,
}: {
  tipoId: string;
  empresas: Empresa[];
  empresasAplicaveisIds: string[];
}) {
  const [selecionadas, setSelecionadas] = useState(new Set(empresasAplicaveisIds));
  const [termo, setTermo] = useState("");
  const [pending, startTransition] = useTransition();
  const [salvo, setSalvo] = useState(false);

  const filtradas = useMemo(() => {
    const alvo = normalizar(termo.trim());
    if (!alvo) return empresas;
    return empresas.filter((e) => normalizar(e.nome).includes(alvo));
  }, [empresas, termo]);

  function alternar(id: string) {
    setSalvo(false);
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function selecionarFiltradas() {
    setSalvo(false);
    setSelecionadas((atual) => new Set([...atual, ...filtradas.map((e) => e.id)]));
  }

  function limparFiltradas() {
    setSalvo(false);
    const idsFiltradas = new Set(filtradas.map((e) => e.id));
    setSelecionadas((atual) => new Set([...atual].filter((id) => !idsFiltradas.has(id))));
  }

  function salvar() {
    startTransition(async () => {
      await definirEmpresasAplicaveisDoTipo(tipoId, [...selecionadas]);
      setSalvo(true);
    });
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar empresa..."
          className="w-64"
          autoComplete="off"
        />
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="md" className="h-9 px-3 text-xs" onClick={selecionarFiltradas}>
            Selecionar {termo ? "filtradas" : "todas"}
          </Button>
          <Button type="button" variant="ghost" size="md" className="h-9 px-3 text-xs" onClick={limparFiltradas}>
            Limpar {termo ? "filtradas" : "seleção"}
          </Button>
        </div>
      </div>

      <div className="max-h-[28rem] overflow-y-auto rounded-lg border border-border">
        <div className="divide-y divide-border">
          {filtradas.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">Nenhuma empresa encontrada.</div>
          ) : (
            filtradas.map((empresa) => (
              <label
                key={empresa.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-surface-muted"
              >
                <input
                  type="checkbox"
                  checked={selecionadas.has(empresa.id)}
                  onChange={() => alternar(empresa.id)}
                  className="h-4 w-4 rounded border-border accent-brand"
                />
                <span className="text-foreground">{empresa.nome}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" loading={pending} onClick={salvar}>
          Salvar seleção
        </Button>
        <span className="text-xs text-foreground/50">
          {selecionadas.size} de {empresas.length} empresas selecionadas
        </span>
        {salvo && !pending && <span className="text-xs text-success">Salvo</span>}
      </div>
    </div>
  );
}
