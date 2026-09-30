"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveCustomer, buscarCepAction } from "@/lib/actions/tomadores";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { Customer } from "@/lib/types";

export function TomadorForm({
  companyId,
  customer,
  redirectTo,
  cancelHref,
}: {
  companyId: string;
  customer?: Customer;
  /** Pra onde ir depois de salvar — sem isso, cai no portal do cliente
   * (/empresas/[companyId]/tomadores). O módulo de emissão da equipe
   * (/admin/emissao-notas) usa isso pra voltar pra tela de emitir nota. */
  redirectTo?: string;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(saveCustomer, undefined);
  const [type, setType] = useState(customer?.type ?? "PF");

  const [zipCode, setZipCode] = useState(customer?.zip_code ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [district, setDistrict] = useState(customer?.district ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [ufEndereco, setUfEndereco] = useState(customer?.state ?? "");
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep] = useState<string | null>(null);

  const zipCodeDigits = zipCode.replace(/\D/g, "");

  async function handleBuscarCep() {
    setErroCep(null);
    if (zipCodeDigits.length !== 8) {
      setErroCep("Digite um CEP com 8 dígitos antes de buscar.");
      return;
    }
    setBuscandoCep(true);
    const resultado = await buscarCepAction(zipCodeDigits);
    setBuscandoCep(false);
    if ("error" in resultado) {
      setErroCep(resultado.error);
      return;
    }
    const dados = resultado.data;
    if (dados.logradouro) setAddress(dados.logradouro);
    if (dados.bairro) setDistrict(dados.bairro);
    if (dados.cidade) setCity(dados.cidade);
    if (dados.uf) setUfEndereco(dados.uf);
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      {customer && <input type="hidden" name="customerId" value={customer.id} />}
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="type">
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as "PF" | "PJ")}
          >
            <option value="PF">Pessoa física</option>
            <option value="PJ">Pessoa jurídica</option>
          </Select>
        </Field>
        <Field label={type === "PF" ? "CPF" : "CNPJ"} htmlFor="cpfCnpj" hint="Opcional">
          <Input id="cpfCnpj" name="cpfCnpj" defaultValue={customer?.cpf_cnpj ?? ""} />
        </Field>
      </div>

      <Field label={type === "PF" ? "Nome" : "Razão social"} htmlFor="name">
        <Input id="name" name="name" defaultValue={customer?.name} autoFocus required />
      </Field>

      <Field label="E-mail" htmlFor="email" hint="Opcional">
        <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ""} />
      </Field>

      <details className="group" open={Boolean(customer?.address)}>
        <summary className="cursor-pointer text-sm font-medium text-brand">
          Endereço (opcional)
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CEP" htmlFor="zipCode" hint="Busca cidade/bairro/endereço sozinho">
            <div className="flex gap-2">
              <Input
                id="zipCode"
                name="zipCode"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                loading={buscandoCep}
                disabled={zipCodeDigits.length !== 8}
                onClick={handleBuscarCep}
              >
                Buscar
              </Button>
            </div>
            {erroCep && <p className="mt-1.5 text-xs text-danger">{erroCep}</p>}
          </Field>
          <Field label="Cidade" htmlFor="city">
            <Input id="city" name="city" value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Endereço" htmlFor="address">
            <Input id="address" name="address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Número" htmlFor="number">
            <Input id="number" name="number" defaultValue={customer?.number ?? ""} />
          </Field>
          <Field label="Complemento" htmlFor="complement">
            <Input id="complement" name="complement" defaultValue={customer?.complement ?? ""} />
          </Field>
          <Field label="Bairro" htmlFor="district">
            <Input
              id="district"
              name="district"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </Field>
          <Field label="UF" htmlFor="state">
            <Input
              id="state"
              name="state"
              maxLength={2}
              value={ufEndereco}
              onChange={(e) => setUfEndereco(e.target.value.toUpperCase())}
            />
          </Field>
        </div>
      </details>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <Link
          href={cancelHref ?? `/empresas/${companyId}/tomadores`}
          className="text-sm font-medium text-foreground/60 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
