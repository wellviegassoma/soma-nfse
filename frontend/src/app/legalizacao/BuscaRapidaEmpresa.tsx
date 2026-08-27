"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/Input";

type Empresa = { id: string; legal_name: string; trade_name: string | null };

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function BuscaRapidaEmpresa({ empresas }: { empresas: Empresa[] }) {
  const [termo, setTermo] = useState("");

  const resultados = useMemo(() => {
    const alvo = normalizar(termo.trim());
    if (!alvo) return [];
    return empresas
      .filter((e) => normalizar(`${e.trade_name ?? ""} ${e.legal_name}`).includes(alvo))
      .slice(0, 8);
  }, [empresas, termo]);

  return (
    <div className="relative">
      <Input
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar empresa e acessar os documentos..."
        className="w-full"
        autoComplete="off"
      />
      {termo.trim() && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          {resultados.length === 0 ? (
            <div className="px-4 py-3 text-sm text-foreground/50">Nenhuma empresa encontrada.</div>
          ) : (
            resultados.map((empresa) => (
              <Link
                key={empresa.id}
                href={`/legalizacao/empresas/${empresa.id}`}
                className="flex flex-col gap-0.5 px-4 py-2.5 transition-colors hover:bg-surface-muted"
                onClick={() => setTermo("")}
              >
                <span className="text-sm font-medium text-foreground">
                  {empresa.trade_name || empresa.legal_name}
                </span>
                <span className="text-xs text-foreground/50">{empresa.legal_name}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
