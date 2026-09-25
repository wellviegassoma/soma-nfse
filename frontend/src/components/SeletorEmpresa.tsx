"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";

type Empresa = { id: string; legal_name: string; trade_name: string | null; cnpj: string | null };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Combobox de busca de empresa pra uso DENTRO de um form (guarda o id
// escolhido num input hidden) — baseado na mesma normalização de busca do
// BuscaRapidaEmpresa, mas sem navegar: só seleciona.
export function SeletorEmpresa({
  name,
  empresas,
  defaultValue,
  required,
}: {
  name: string;
  empresas: Empresa[];
  defaultValue?: { id: string; legal_name: string; trade_name: string | null } | null;
  required?: boolean;
}) {
  const [selecionada, setSelecionada] = useState(defaultValue ?? null);
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(false);

  const resultados = useMemo(() => {
    const alvo = normalizar(termo.trim());
    if (!alvo) return empresas.slice(0, 8);
    return empresas
      .filter(
        (e) =>
          normalizar(`${e.trade_name ?? ""} ${e.legal_name} ${e.cnpj ?? ""}`).includes(alvo),
      )
      .slice(0, 8);
  }, [empresas, termo]);

  if (selecionada) {
    return (
      <div className="flex items-center gap-2">
        <input type="hidden" name={name} value={selecionada.id} />
        <div className="flex h-11 flex-1 items-center rounded-lg border border-border bg-surface-muted px-3.5 text-sm text-foreground">
          {selecionada.trade_name || selecionada.legal_name}
        </div>
        <button
          type="button"
          onClick={() => setSelecionada(null)}
          className="text-xs font-medium text-foreground/60 hover:underline"
        >
          Trocar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value="" />
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Buscar empresa por nome ou CNPJ..."
        autoComplete="off"
        required={required}
      />
      {aberto && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {resultados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-foreground/50">Nenhuma empresa encontrada.</div>
          ) : (
            resultados.map((empresa) => (
              <button
                key={empresa.id}
                type="button"
                onClick={() => {
                  setSelecionada(empresa);
                  setTermo("");
                }}
                className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-muted"
              >
                <span className="text-sm font-medium text-foreground">
                  {empresa.trade_name || empresa.legal_name}
                </span>
                <span className="text-xs text-foreground/50">{empresa.legal_name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
