"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Resumo = { total: number; sucessos: number; divergencias?: number; erros: number };

// Botão genérico pras etapas que só fazem um GET e devolvem um resumo
// agregado (Etapa 2/3 ISS RJ, Etapa 4 conferência Petrópolis) — depois
// de rodar, atualiza a página pra mostrar a "última rodada" nova (lida
// direto do banco no server component, não fica só no estado local).
export function RodarEtapaButton({
  endpoint,
  label,
}: {
  endpoint: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  async function rodar() {
    setPending(true);
    setErro(null);
    setResumo(null);
    try {
      const resp = await fetch(endpoint);
      const corpo = await resp.json();
      if (!resp.ok) {
        setErro(corpo?.error || "Não foi possível rodar essa etapa agora.");
        return;
      }
      setResumo(corpo);
      router.refresh();
    } catch {
      setErro("Não foi possível rodar essa etapa agora.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={rodar}>
        {label}
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}
      {resumo && (
        <Alert tone={resumo.erros > 0 || (resumo.divergencias ?? 0) > 0 ? "warning" : "success"}>
          {resumo.sucessos} de {resumo.total} ok
          {resumo.divergencias ? `, ${resumo.divergencias} com divergência` : ""}
          {resumo.erros ? `, ${resumo.erros} com erro` : ""}.
        </Alert>
      )}
    </div>
  );
}
