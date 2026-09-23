"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";

export function CompanyPicker({
  empresas,
}: {
  empresas: { id: string; nome: string }[];
}) {
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter((e) => e.nome.toLowerCase().includes(termo));
  }, [busca, empresas]);

  return (
    <div className="flex flex-col gap-3">
      <Input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder={`Buscar entre as ${empresas.length} empresas...`}
        autoComplete="off"
        autoFocus
      />
      <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border">
        {filtradas.length === 0 ? (
          <p className="p-6 text-center text-sm text-foreground/50">Nenhuma empresa encontrada.</p>
        ) : (
          <div className="divide-y divide-border">
            {filtradas.map((empresa) => (
              <Link
                key={empresa.id}
                href={`/admin/emissao-notas/${empresa.id}`}
                className="block px-4 py-2.5 text-sm hover:bg-surface-muted"
              >
                {empresa.nome}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
