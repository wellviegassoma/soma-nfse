"use client";

import { useState, useTransition } from "react";
import { marcarEquiparacaoHospitalar } from "@/lib/actions/fechamento";

export function EquiparacaoHospitalarToggle({
  notaId,
  companyId,
  marcado,
}: {
  notaId: string;
  companyId: string;
  marcado: boolean;
}) {
  const [valor, setValor] = useState(marcado);
  const [pending, startTransition] = useTransition();

  return (
    <label
      className="flex shrink-0 items-center gap-1.5 text-xs text-foreground/60"
      title="Equiparação hospitalar — presunção de 8% IRPJ / 12% CSLL nessa nota, em vez de 32%/32%"
    >
      <input
        type="checkbox"
        checked={valor}
        disabled={pending}
        onChange={(e) => {
          const novoValor = e.target.checked;
          setValor(novoValor);
          startTransition(async () => {
            const resultado = await marcarEquiparacaoHospitalar(notaId, companyId, novoValor);
            if (resultado.error) setValor(!novoValor);
          });
        }}
        className="h-3.5 w-3.5 rounded border-border accent-brand"
      />
      Hospitalar
    </label>
  );
}
