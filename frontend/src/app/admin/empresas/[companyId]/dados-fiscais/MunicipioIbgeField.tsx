"use client";

import { useEffect, useState } from "react";
import { buscarMunicipioIbge } from "@/lib/actions/ibge";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";

type Resultado = { codigo: string; municipio: { nome: string; uf: string } | null };

export function MunicipioIbgeField({ defaultValue }: { defaultValue: string }) {
  const [codigo, setCodigo] = useState(defaultValue);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!/^\d{7}$/.test(codigo)) return;
    let cancelado = false;
    const timeout = setTimeout(() => {
      buscarMunicipioIbge(codigo).then((municipio) => {
        if (!cancelado) setResultado({ codigo, municipio });
      });
    }, 400);
    return () => {
      cancelado = true;
      clearTimeout(timeout);
    };
  }, [codigo]);

  const valido = /^\d{7}$/.test(codigo);
  // undefined = ainda não resolvido pra esse código específico (buscando
  // ou nem começou); null = resolvido e não encontrado.
  const municipioAtual = resultado?.codigo === codigo ? resultado.municipio : undefined;

  const hint = !valido
    ? undefined
    : municipioAtual === undefined
      ? "Consultando..."
      : municipioAtual
        ? `${municipioAtual.nome}${municipioAtual.uf ? ` — ${municipioAtual.uf}` : ""}`
        : "Código não encontrado no IBGE.";

  return (
    <Field label="Código IBGE do município" htmlFor="municipalityIbgeCode" hint={hint}>
      <Input
        id="municipalityIbgeCode"
        name="municipalityIbgeCode"
        defaultValue={defaultValue}
        onChange={(e) => setCodigo(e.target.value.trim())}
      />
    </Field>
  );
}
