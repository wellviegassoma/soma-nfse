"use client";

import { useState } from "react";
import { buscarCepAction } from "@/lib/actions/tomadores";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { UfMunicipioFields, type UfMunicipio } from "@/components/UfMunicipioFields";

export type EnderecoInicial = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: UfMunicipio;
};

// Endereço da empresa em Dados fiscais — pra equipe atualizar quando o
// cliente muda de sede (alteração contratual). O resto do formulário é
// não-controlado; aqui o estado é local porque a busca por CEP preenche
// vários campos de uma vez.
export function EnderecoFields({ inicial }: { inicial: EnderecoInicial }) {
  const [cep, setCep] = useState(inicial.cep);
  const [logradouro, setLogradouro] = useState(inicial.logradouro);
  const [numero, setNumero] = useState(inicial.numero);
  const [complemento, setComplemento] = useState(inicial.complemento);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [municipio, setMunicipio] = useState<UfMunicipio>(inicial.municipio);
  const [buscando, setBuscando] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  const cepDigits = cep.replace(/\D/g, "");

  async function buscarCep() {
    setErroCep(null);
    setBuscando(true);
    const r = await buscarCepAction(cepDigits).catch(() => ({ error: "Não foi possível buscar agora. Tente de novo." }));
    setBuscando(false);
    if ("error" in r) {
      setErroCep(r.error);
      return;
    }
    const d = r.data;
    if (d.logradouro) setLogradouro(d.logradouro);
    if (d.bairro) setBairro(d.bairro);
    if (d.uf) setMunicipio({ uf: d.uf, municipio: d.cidade ?? "", ibge: d.ibge ?? "" });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field
        label="CEP"
        htmlFor="addressZip"
        error={erroCep ?? undefined}
        hint="Busca logradouro, bairro e município sozinho"
      >
        <div className="flex gap-2">
          <Input id="addressZip" name="addressZip" value={cep} onChange={(e) => setCep(e.target.value)} />
          <Button
            type="button"
            variant="secondary"
            loading={buscando}
            disabled={cepDigits.length !== 8}
            onClick={buscarCep}
          >
            Buscar
          </Button>
        </div>
      </Field>
      <Field label="Logradouro" htmlFor="addressStreet">
        <Input id="addressStreet" name="addressStreet" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} />
      </Field>
      <Field label="Número" htmlFor="addressNumber">
        <Input id="addressNumber" name="addressNumber" value={numero} onChange={(e) => setNumero(e.target.value)} />
      </Field>
      <Field label="Complemento" htmlFor="addressComplement" hint="Opcional">
        <Input
          id="addressComplement"
          name="addressComplement"
          value={complemento}
          onChange={(e) => setComplemento(e.target.value)}
        />
      </Field>
      <Field label="Bairro" htmlFor="addressNeighborhood">
        <Input id="addressNeighborhood" name="addressNeighborhood" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      </Field>
      <UfMunicipioFields
        value={municipio}
        onChange={setMunicipio}
        hintMunicipio="Obrigatório pra emitir NFS-e e pro controle de legalização."
      />
    </div>
  );
}
