"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { mesCorrenteBrasilia } from "@/lib/competencia";

// Deixa o usuário escolher a competência da parcela antes de baixar a
// guia (decisão explícita — não trava sempre na "próxima em aberto").
// Não pré-popula as parcelas disponíveis via PARCELASPARAGERAR162 porque
// esse serviço ainda não foi validado contra a Serpro (gateway
// indisponível durante o Passo 0) — uma vez confirmado, dá pra trocar o
// input livre por uma lista das parcelas realmente pendentes.
export function EmitirGuiaParcelamentoButton({
  companyId,
  numeroParcelamento,
}: {
  companyId: string;
  numeroParcelamento: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [competencia, setCompetencia] = useState(mesCorrenteBrasilia());

  function baixar() {
    const parcela = competencia.replace("-", "");
    const url = `/admin/empresas/${companyId}/integra-contador/parcelamentos/simples-nacional/${numeroParcelamento}/guia?parcela=${parcela}`;
    window.open(url, "_blank");
  }

  if (!aberto) {
    return (
      <Button type="button" variant="secondary" size="md" onClick={() => setAberto(true)}>
        Baixar guia
      </Button>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-36">
        <Input
          type="month"
          value={competencia}
          onChange={(e) => setCompetencia(e.target.value)}
        />
      </div>
      <Button type="button" variant="primary" onClick={baixar}>
        Baixar
      </Button>
      <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
    </div>
  );
}
