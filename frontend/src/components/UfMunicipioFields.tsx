"use client";

import { useEffect, useState } from "react";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

// Seletor UF → Município usado em todo cadastro de cliente. O código IBGE
// sai da própria lista (nunca é digitado), então o trio UF / nome / código
// fica sempre consistente. A lista vem de arquivos estáticos em
// public/ibge/municipios/<UF>.json, gerados por
// scripts/ibge-municipios/gerar.py a partir da API do IBGE.

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type UfMunicipio = { uf: string; municipio: string; ibge: string };

type Municipio = [codigo: string, nome: string];

const cache = new Map<string, Promise<Municipio[]>>();

function carregarMunicipios(uf: string): Promise<Municipio[]> {
  let p = cache.get(uf);
  if (!p) {
    p = fetch(`/ibge/municipios/${uf}.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Municipio[]>) : Promise.reject(new Error(String(r.status)))))
      .catch((e) => {
        cache.delete(uf);
        throw e;
      });
    cache.set(uf, p);
  }
  return p;
}

// "PETROPOLIS", "Petrópolis" e "petropolis" viram a mesma chave — o cadastro
// antigo e a busca por CNPJ gravam o nome em maiúsculas e sem acento.
function chave(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

export function UfMunicipioFields({
  value,
  onChange,
  obrigatorio = false,
  hintMunicipio,
}: {
  value: UfMunicipio;
  onChange: (v: UfMunicipio) => void;
  obrigatorio?: boolean;
  hintMunicipio?: string;
}) {
  const uf = value.uf.toUpperCase();
  const ufValida = (UFS as readonly string[]).includes(uf);
  const [lista, setLista] = useState<{ uf: string; municipios: Municipio[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ufValida) return;
    let cancelado = false;
    carregarMunicipios(uf).then(
      (municipios) => {
        if (cancelado) return;
        setErro(null);
        setLista({ uf, municipios });
      },
      () => {
        if (!cancelado) setErro("Não foi possível carregar a lista de municípios.");
      },
    );
    return () => {
      cancelado = true;
    };
  }, [uf, ufValida]);

  const municipios = lista?.uf === uf ? lista.municipios : null;

  // Valor que veio de fora (cadastro antigo, busca por CNPJ/CEP) sem código
  // IBGE ou com nome em outra grafia: casa com a lista e completa o resto.
  useEffect(() => {
    if (!municipios) return;
    const porCodigo = value.ibge ? municipios.find(([c]) => c === value.ibge) : undefined;
    const achado =
      porCodigo ?? (value.municipio ? municipios.find(([, n]) => chave(n) === chave(value.municipio)) : undefined);
    if (achado && (achado[0] !== value.ibge || achado[1] !== value.municipio || value.uf !== uf)) {
      onChange({ uf, municipio: achado[1], ibge: achado[0] });
    }
  }, [municipios, value.ibge, value.municipio, value.uf, uf, onChange]);

  const selecionado = municipios?.find(([c]) => c === value.ibge);
  // Nome antigo que não existe na lista do IBGE (digitado errado) — mostra
  // como opção pra não sumir da tela, até alguém escolher o certo.
  const nomeSemCorrespondencia = municipios && !selecionado && value.municipio ? value.municipio : null;

  const hintIbge = !ufValida
    ? "Selecione a UF e o município."
    : !value.ibge
      ? "Preenchido automaticamente ao escolher o município."
      : undefined;

  return (
    <>
      <Field label="UF" htmlFor="state" hint={obrigatorio ? undefined : "Opcional"}>
        <Select
          id="state"
          value={ufValida ? uf : ""}
          required={obrigatorio}
          onChange={(e) => onChange({ uf: e.target.value, municipio: "", ibge: "" })}
        >
          <option value="">Selecione</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Município"
        htmlFor="municipalityName"
        error={erro ?? (nomeSemCorrespondencia ? `"${nomeSemCorrespondencia}" não existe na lista do IBGE — escolha o município correto.` : undefined)}
        hint={hintMunicipio ?? (obrigatorio ? undefined : "Opcional")}
      >
        <Select
          id="municipalityName"
          value={selecionado ? selecionado[0] : ""}
          required={obrigatorio}
          disabled={!ufValida || !municipios}
          onChange={(e) => {
            const m = municipios?.find(([c]) => c === e.target.value);
            onChange({ uf, municipio: m ? m[1] : "", ibge: m ? m[0] : "" });
          }}
        >
          <option value="">
            {!ufValida ? "Selecione a UF primeiro" : !municipios ? "Carregando..." : "Selecione"}
          </option>
          {municipios?.map(([codigo, nome]) => (
            <option key={codigo} value={codigo}>
              {nome}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Código IBGE do município" htmlFor="municipalityIbgeCode" hint={hintIbge}>
        <Input id="municipalityIbgeCode" value={value.ibge} readOnly tabIndex={-1} className="bg-foreground/5" />
      </Field>
      <input type="hidden" name="state" value={ufValida ? uf : ""} />
      <input type="hidden" name="municipalityName" value={selecionado ? selecionado[1] : value.municipio} />
      <input type="hidden" name="municipalityIbgeCode" value={value.ibge} />
    </>
  );
}
