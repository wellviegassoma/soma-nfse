"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverProspectEtapa } from "@/lib/actions/comercial";
import { Select } from "@/components/ui/Select";

type Etapa = { id: string; nome: string; tipo: string };

// Etapas TERMINAL_GANHO não aparecem na lista de destino direto — escolher
// "virar Cliente Ativo" manda pra tela de confirmação em vez de mover na
// hora (ver plano: nunca cria empresa sem passar por uma tela de
// confirmação).
export function MoverEtapaMenu({
  prospectId,
  etapaAtualId,
  etapas,
}: {
  prospectId: string;
  etapaAtualId: string;
  etapas: Etapa[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <Select
        className="h-8 text-xs"
        value={etapaAtualId}
        disabled={pending}
        onChange={(e) => {
          const destino = e.target.value;
          if (destino === "CLIENTE_ATIVO") {
            router.push(`/admin/comercial/${prospectId}/confirmar-cliente`);
            return;
          }
          if (destino === etapaAtualId) return;
          setError(null);
          startTransition(async () => {
            try {
              await moverProspectEtapa(prospectId, destino);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Não foi possível mover.");
            }
          });
        }}
      >
        <option value={etapaAtualId} disabled>
          Mover para...
        </option>
        {etapas.map((etapa) => (
          <option key={etapa.id} value={etapa.id}>
            {etapa.nome}
          </option>
        ))}
        <option value="CLIENTE_ATIVO">✓ Virar Cliente Ativo…</option>
      </Select>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
