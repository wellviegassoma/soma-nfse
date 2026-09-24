"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { criarProspect, buscarCnpjParaProspect } from "@/lib/actions/comercial";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

export function NovoProspectForm() {
  const [state, formAction, pending] = useActionState(criarProspect, undefined);

  const [pessoaTipo, setPessoaTipo] = useState<"PF" | "PJ" | "">("");
  const [cnpj, setCnpj] = useState("");
  const [cpf, setCpf] = useState("");
  const [nome, setNome] = useState("");
  const [regimeTributario, setRegimeTributario] = useState("");

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
    const resultado = await buscarCnpjParaProspect(cnpjDigits);
    setBuscando(false);

    if ("error" in resultado) {
      setBuscaErro(resultado.error);
      return;
    }
    const dados = resultado.data;
    setPessoaTipo("PJ");
    if (!nome) setNome(dados.nomeFantasia || dados.razaoSocial);
    if (dados.simplesNacional) setRegimeTributario("SIMPLES_NACIONAL");
    setBuscaInfo(
      `${dados.razaoSocial}${dados.municipio ? ` · ${dados.municipio}/${dados.uf}` : ""}${
        dados.ativa ? "" : ` · situação: ${dados.situacaoCadastral ?? "não ativa"}`
      }`,
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Nome" htmlFor="nome" hint="Nome do prospect (ex.: Dr. Fulano - Clínica X).">
        <Input id="nome" name="nome" autoFocus required value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Tipo do caso" htmlFor="tipoOnboarding">
          <Select id="tipoOnboarding" name="tipoOnboarding" defaultValue="">
            <option value="">Não definido</option>
            <option value="TRANSICAO_CONTABIL">Transição contábil (já tem CNPJ)</option>
            <option value="ABERTURA_NOVO_CNPJ">Abertura de CNPJ novo</option>
          </Select>
        </Field>
        <Field label="Pessoa" htmlFor="pessoaTipo">
          <Select
            id="pessoaTipo"
            name="pessoaTipo"
            value={pessoaTipo}
            onChange={(e) => setPessoaTipo(e.target.value as "PF" | "PJ" | "")}
          >
            <option value="">Não definido</option>
            <option value="PJ">Pessoa Jurídica</option>
            <option value="PF">Pessoa Física</option>
          </Select>
        </Field>
      </div>

      {pessoaTipo === "PF" ? (
        <Field label="CPF" htmlFor="cpf" hint="Opcional">
          <Input id="cpf" name="cpf" placeholder="000.000.000-00" value={cpf} onChange={(e) => setCpf(e.target.value)} />
        </Field>
      ) : (
        <Field label="CNPJ" htmlFor="cnpj" hint="Opcional — buscamos os dados automaticamente na Receita Federal">
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
              Buscar CNPJ
            </Button>
          </div>
          {buscaErro && <p className="mt-1.5 text-xs text-danger">{buscaErro}</p>}
          {buscaInfo && <p className="mt-1.5 text-xs text-success">{buscaInfo}</p>}
        </Field>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Especialidade / cidade" htmlFor="especialidade" hint="Opcional">
          <Input id="especialidade" name="especialidade" />
        </Field>
        <Field label="Regime tributário" htmlFor="regimeTributario" hint="Opcional">
          <Input
            id="regimeTributario"
            name="regimeTributario"
            value={regimeTributario}
            onChange={(e) => setRegimeTributario(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Faturamento médio estimado" htmlFor="faturamentoMedioEstimado" hint="Opcional">
          <Input id="faturamentoMedioEstimado" name="faturamentoMedioEstimado" inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Honorário SOMA" htmlFor="honorarioSoma" hint="Opcional">
          <Input id="honorarioSoma" name="honorarioSoma" inputMode="decimal" placeholder="0,00" />
        </Field>
      </div>

      <Field label="Descrição" htmlFor="descricao" hint="Opcional — anotações livres, como no card do Trello">
        <textarea
          id="descricao"
          name="descricao"
          rows={4}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </Field>

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Criar prospect
        </Button>
        <Link href="/admin/comercial" className="text-sm font-medium text-foreground/60 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
