"use client";

import { useState } from "react";
import { UfMunicipioFields, type UfMunicipio } from "@/components/UfMunicipioFields";

// Em Dados fiscais o resto do formulário é não-controlado (defaultValue);
// este invólucro guarda o estado do trio UF / município / código IBGE.
export function MunicipioIbgeField({ defaultValue }: { defaultValue: UfMunicipio }) {
  const [valor, setValor] = useState<UfMunicipio>(defaultValue);
  return (
    <UfMunicipioFields
      value={valor}
      onChange={setValor}
      hintMunicipio="Obrigatório pra emitir NFS-e e pro controle de legalização."
    />
  );
}
