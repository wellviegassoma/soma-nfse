"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createCompany, buscarCnpjAction } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { TAX_REGIME_LABELS, type TaxRegime } from "@/lib/types";

export function NewCompanyForm() {
  const [state, formAction, pending] = useActionState(createCompany, undefined);

  const [cnpj, setCnpj] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnae, setCnae] = useState("");
  const [municipalityIbgeCode, setMunicipalityIbgeCode] = useState("");
  const [municipalityName, setMunicipalityName] = useState("");
  const [uf, setUf] = useState("");
  const [addressStreet, setAddressStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [addressComplement, setAddressComplement] = useState("");
  const [addressNeighborhood, setAddressNeighborhood] = useState("");
  const [addressZip, setAddressZip] = useState("");
  const [taxRegime, setTaxRegime] = useState<TaxRegime | "">("");

  const [buscando, setBuscando] = useState(false);
  const [buscaErro, setBuscaErro] = useState<string | null>(null);
  const [buscaInfo, setBuscaInfo] = useState<string | null>(null);

  const cnpjDigits = cnpj.replace(/\D/g, "");

  async function handleBuscarCnpj() {
    setBuscaErro(null);
    setBuscaInfo(null);
    if (cnpjDigits.length !== 14) {
      setBuscaErro("Digite um CNPJ com 14 dígitos antes de buscar.");
      return;
    }
    setBuscando(true);
    const resultado = await buscarCnpjAction(cnpjDigits);
    setBuscando(false);

    if ("error" in resultado) {
      setBuscaErro(resultado.error);
      return;
    }

    const dados = resultado.data;
    setLegalName(dados.razaoSocial);
    if (dados.nomeFantasia) setTradeName(dados.nomeFantasia);
    if (dados.cnae) setCnae(dados.cnae);
    if (dados.municipioIbge) setMunicipalityIbgeCode(dados.municipioIbge);
    if (dados.municipio) setMunicipalityName(dados.municipio);
    if (dados.uf) setUf(dados.uf);
    if (dados.logradouro) setAddressStreet(dados.logradouro);
    if (dados.numero) setAddressNumber(dados.numero);
    if (dados.complemento) setAddressComplement(dados.complemento);
    if (dados.bairro) setAddressNeighborhood(dados.bairro);
    if (dados.cep) setAddressZip(dados.cep);
    if (dados.simplesNacional) setTaxRegime("SIMPLES_NACIONAL");
    if (!organizationName) setOrganizationName(dados.nomeFantasia || dados.razaoSocial);

    setBuscaInfo(
      `${dados.razaoSocial}${dados.municipio ? ` · ${dados.municipio}/${dados.uf}` : ""}${
        dados.ativa ? "" : ` · situação: ${dados.situacaoCadastral ?? "não ativa"}`
      }`,
    );
  }

  return (
    <Card className="max-w-lg p-6 sm:p-8">
      <form action={formAction} className="flex flex-col gap-4">
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field label="CNPJ" htmlFor="cnpj" hint="Buscamos os dados automaticamente na Receita Federal">
          <div className="flex gap-2">
            <Input
              id="cnpj"
              name="cnpj"
              placeholder="00.000.000/0000-00"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              loading={buscando}
              disabled={cnpjDigits.length !== 14}
              onClick={handleBuscarCnpj}
            >
              Buscar dados
            </Button>
          </div>
          {buscaErro && <p className="mt-1.5 text-xs text-danger">{buscaErro}</p>}
          {buscaInfo && <p className="mt-1.5 text-xs text-success">{buscaInfo}</p>}
        </Field>

        <Field
          label="Nome da empresa/organização"
          htmlFor="organizationName"
          hint="Como o grupo é conhecido internamente (ex.: Clínica ABC)."
        >
          <Input
            id="organizationName"
            name="organizationName"
            autoFocus
            required
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
        </Field>

        <Field label="Razão social" htmlFor="legalName">
          <Input
            id="legalName"
            name="legalName"
            required
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
          />
        </Field>

        <Field label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
          <Input
            id="tradeName"
            name="tradeName"
            value={tradeName}
            onChange={(e) => setTradeName(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="CNAE principal" htmlFor="cnae" hint="Opcional">
            <Input id="cnae" name="cnae" value={cnae} onChange={(e) => setCnae(e.target.value)} />
          </Field>
          <Field label="Regime tributário" htmlFor="taxRegime" hint="Opcional">
            <Select
              id="taxRegime"
              name="taxRegime"
              value={taxRegime}
              onChange={(e) => setTaxRegime(e.target.value as TaxRegime | "")}
            >
              <option value="">Selecione</option>
              {Object.entries(TAX_REGIME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <input type="hidden" name="municipalityIbgeCode" value={municipalityIbgeCode} />
        <input type="hidden" name="municipalityName" value={municipalityName} />
        <input type="hidden" name="state" value={uf} />
        <input type="hidden" name="addressStreet" value={addressStreet} />
        <input type="hidden" name="addressNumber" value={addressNumber} />
        <input type="hidden" name="addressComplement" value={addressComplement} />
        <input type="hidden" name="addressNeighborhood" value={addressNeighborhood} />
        <input type="hidden" name="addressZip" value={addressZip} />

        <div className="mt-2 flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Criar empresa
          </Button>
          <Link
            href="/admin/empresas"
            className="text-sm font-medium text-foreground/60 hover:underline"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </Card>
  );
}
