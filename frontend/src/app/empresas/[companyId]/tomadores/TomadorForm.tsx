"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveCustomer, buscarCepAction, buscarDadosTomadorAction } from "@/lib/actions/tomadores";
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

  const [documento, setDocumento] = useState(customer?.cpf_cnpj ?? "");
  const [nome, setNome] = useState(customer?.name ?? "");
  const [email, setEmail] = useState(customer?.email ?? "");
  const [numero, setNumero] = useState(customer?.number ?? "");
  const [complemento, setComplemento] = useState(customer?.complement ?? "");
  const [enderecoAberto, setEnderecoAberto] = useState(Boolean(customer?.address));
  const [buscandoDoc, setBuscandoDoc] = useState(false);
  const [msgDoc, setMsgDoc] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const documentoDigits = documento.replace(/\D/g, "");
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

  async function handleBuscarDocumento() {
    setMsgDoc(null);
    setBuscandoDoc(true);
    const r = await buscarDadosTomadorAction(companyId, documentoDigits).catch(() => ({
      error: "Não foi possível buscar agora. Tente de novo.",
    }));
    setBuscandoDoc(false);
    if ("error" in r) {
      setMsgDoc({ tom: "erro", texto: r.error });
      return;
    }
    const d = r.data;
    if (documentoDigits.length === 14) setType("PJ");
    if (documentoDigits.length === 11) setType("PF");
    if (d.nome) setNome(d.nome);
    if (d.email) setEmail(d.email);
    if (d.cep) setZipCode(d.cep);
    if (d.endereco) setAddress(d.endereco);
    if (d.numero) setNumero(d.numero);
    if (d.complemento) setComplemento(d.complemento);
    if (d.bairro) setDistrict(d.bairro);
    if (d.cidade) setCity(d.cidade);
    if (d.uf) setUfEndereco(d.uf);
    if (d.cep || d.endereco) setEnderecoAberto(true);
    setMsgDoc({
      tom: "ok",
      texto: `Dados preenchidos ${r.origem}. Confira antes de salvar.${r.aviso ? ` ${r.aviso}` : ""}`,
    });
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
          <div className="flex gap-2">
            <Input
              id="cpfCnpj"
              name="cpfCnpj"
              inputMode="numeric"
              value={documento}
              onChange={(e) => {
                setDocumento(e.target.value);
                const n = e.target.value.replace(/\D/g, "").length;
                if (n === 14) setType("PJ");
                if (n === 11) setType("PF");
              }}
            />
            <Button
              type="button"
              variant="secondary"
              loading={buscandoDoc}
              disabled={documentoDigits.length !== 11 && documentoDigits.length !== 14}
              onClick={handleBuscarDocumento}
            >
              Buscar dados
            </Button>
          </div>
        </Field>
      </div>
      {msgDoc && (
        <p className={`-mt-2 text-xs ${msgDoc.tom === "erro" ? "text-danger" : "text-success"}`}>{msgDoc.texto}</p>
      )}

      <Field label={type === "PF" ? "Nome" : "Razão social"} htmlFor="name">
        <Input id="name" name="name" value={nome} onChange={(e) => setNome(e.target.value)} required />
      </Field>

      <Field label="E-mail" htmlFor="email" hint="Opcional">
        <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <details
        className="group"
        open={enderecoAberto}
        onToggle={(e) => setEnderecoAberto((e.currentTarget as HTMLDetailsElement).open)}
      >
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
            <Input id="number" name="number" value={numero} onChange={(e) => setNumero(e.target.value)} />
          </Field>
          <Field label="Complemento" htmlFor="complement">
            <Input id="complement" name="complement" value={complemento} onChange={(e) => setComplemento(e.target.value)} />
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
