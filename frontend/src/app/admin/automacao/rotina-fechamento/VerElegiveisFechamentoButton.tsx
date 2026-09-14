"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

// Etapa 6 — só lista quem já pode fechar (leitura, sem efeito nenhum). O
// ato de marcar como fechada continua na Central Simples Nacional, onde
// o contador já vê o DAS calculado antes de decidir — ver
// FecharAntecipadoLoteButton.tsx lá.
export function VerElegiveisFechamentoButton({ competencia }: { competencia: string }) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);

  async function verificar() {
    setPending(true);
    setErro(null);
    setTotal(null);
    try {
      const resp = await fetch(`/api/rotina-fechamento/fechar-antecipado?competencia=${competencia}`);
      const corpo = await resp.json();
      if (!resp.ok) {
        setErro(corpo?.error || "Não foi possível verificar agora.");
        return;
      }
      setTotal(corpo.elegiveis.length);
    } catch {
      setErro("Não foi possível verificar agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={verificar}>
        Ver quem já pode fechar
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}
      {total != null && (
        <Alert tone="success">
          {total} empresa(s) elegível(is) (Anexo III fixo, sem Fator R).{" "}
          <Link href={`/admin/fechamento/simples?competencia=${competencia}`} className="underline">
            Ir pra Central Simples Nacional pra fechar
          </Link>
        </Alert>
      )}
    </div>
  );
}
