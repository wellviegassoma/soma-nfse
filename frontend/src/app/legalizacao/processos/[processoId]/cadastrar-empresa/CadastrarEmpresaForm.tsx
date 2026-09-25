"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { cadastrarEmpresaDoProcesso, buscarCnpjParaProcesso } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { SeletorEmpresa } from "@/components/SeletorEmpresa";
import { TAX_REGIME_LABELS, type TaxRegime } from "@/lib/types";

type Processo = { id: string; nome: string; cnpj: string | null };
type EmpresaResumo = { id: string; legal_name: string; trade_name: string | null };
type Empresa = EmpresaResumo & { cnpj: string | null };

export function CadastrarEmpresaForm({
  processo,
  empresaExistente,
  empresas,
}: {
  processo: Processo;
  empresaExistente: EmpresaResumo | null;
  empresas: Empresa[];
}) {
  const [state, formAction, pending] = useActionState(cadastrarEmpresaDoProcesso, undefined);
  const [modo, setModo] = useState<"CRIAR" | "VINCULAR">(empresaExistente ? "VINCULAR" : "CRIAR");

  const [cnpj, setCnpj] = useState(processo.cnpj ?? "");
  const [organizationName, setOrganizationName] = useState(processo.nome);
  const [legalName, setLegalName] = useState(processo.nome);
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
  const [dataAbertura, setDataAbertura] = useState("");

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
    const resultado = await buscarCnpjParaProcesso(cnpjDigits);
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
    if (dados.dataAbertura) setDataAbertura(dados.dataAbertura);

    setBuscaInfo(`${dados.razaoSocial}${dados.municipio ? ` · ${dados.municipio}/${dados.uf}` : ""}`);
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="processoId" value={processo.id} />
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="O que fazer" htmlFor="modo">
        <Select id="modo" value={modo} onChange={(e) => setModo(e.target.value as "CRIAR" | "VINCULAR")}>
          <option value="CRIAR">Criar empresa nova</option>
          <option value="VINCULAR">Vincular uma empresa já cadastrada</option>
        </Select>
      </Field>

      {modo === "VINCULAR" ? (
        <Field label="Empresa" htmlFor="vincularExistenteId">
          <SeletorEmpresa
            name="vincularExistenteId"
            empresas={empresas}
            defaultValue={empresaExistente}
            required
          />
        </Field>
      ) : (
        <>
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

          <input type="hidden" name="dataAbertura" value={dataAbertura} />

          <Field label="Nome da empresa/organização" htmlFor="organizationName">
            <Input
              id="organizationName"
              name="organizationName"
              required
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
            />
          </Field>

          <Field label="Razão social" htmlFor="legalName">
            <Input id="legalName" name="legalName" required value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </Field>

          <Field label="Nome fantasia" htmlFor="tradeName" hint="Opcional">
            <Input id="tradeName" name="tradeName" value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="CNAE principal" htmlFor="cnae" hint="Opcional">
              <Input id="cnae" name="cnae" value={cnae} onChange={(e) => setCnae(e.target.value)} />
            </Field>
            <Field label="Regime tributário" htmlFor="taxRegime" hint="Opcional">
              <Select id="taxRegime" name="taxRegime" value={taxRegime} onChange={(e) => setTaxRegime(e.target.value as TaxRegime | "")}>
                <option value="">Selecione</option>
                {Object.entries(TAX_REGIME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <Field label="Logradouro" htmlFor="addressStreet" hint="Opcional">
              <Input id="addressStreet" name="addressStreet" value={addressStreet} onChange={(e) => setAddressStreet(e.target.value)} />
            </Field>
            <Field label="Número" htmlFor="addressNumber" hint="Opcional">
              <Input id="addressNumber" name="addressNumber" value={addressNumber} onChange={(e) => setAddressNumber(e.target.value)} />
            </Field>
            <Field label="Complemento" htmlFor="addressComplement" hint="Opcional">
              <Input id="addressComplement" name="addressComplement" value={addressComplement} onChange={(e) => setAddressComplement(e.target.value)} />
            </Field>
            <Field label="Bairro" htmlFor="addressNeighborhood" hint="Opcional">
              <Input id="addressNeighborhood" name="addressNeighborhood" value={addressNeighborhood} onChange={(e) => setAddressNeighborhood(e.target.value)} />
            </Field>
            <Field label="CEP" htmlFor="addressZip" hint="Opcional">
              <Input id="addressZip" name="addressZip" value={addressZip} onChange={(e) => setAddressZip(e.target.value)} />
            </Field>
            <Field label="UF" htmlFor="state" hint="Opcional">
              <Input id="state" name="state" maxLength={2} value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} />
            </Field>
            <Field label="Município" htmlFor="municipalityName" hint="Opcional">
              <Input id="municipalityName" name="municipalityName" value={municipalityName} onChange={(e) => setMunicipalityName(e.target.value)} />
            </Field>
            <Field label="Código IBGE do município" htmlFor="municipalityIbgeCode" hint="Obrigatório pra emitir NFS-e depois">
              <Input id="municipalityIbgeCode" name="municipalityIbgeCode" value={municipalityIbgeCode} onChange={(e) => setMunicipalityIbgeCode(e.target.value)} />
            </Field>
          </div>
        </>
      )}

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          {modo === "VINCULAR" ? "Vincular empresa ao processo" : "Confirmar — criar empresa"}
        </Button>
        <Link href={`/legalizacao/processos/${processo.id}`} className="text-sm font-medium text-foreground/60 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
