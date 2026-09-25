"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { criarProcesso } from "@/lib/actions/legalizacao-processos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { SeletorEmpresa } from "@/components/SeletorEmpresa";
import { ALTERACAO_ITEM_LABELS, hojeSaoPaulo } from "@/app/legalizacao/processos/status";

type TipoProcesso = "ABERTURA" | "ALTERACAO" | "ENCERRAMENTO";
type Fluxo = { id: string; nome: string; tipo_processo: string };
type Empresa = { id: string; legal_name: string; trade_name: string | null; cnpj: string | null };
type Responsavel = { id: string; full_name: string };

export function NovoProcessoForm({
  fluxos,
  empresas,
  responsaveis,
  tipoPreSelecionado,
  empresaPreSelecionada,
}: {
  fluxos: Fluxo[];
  empresas: Empresa[];
  responsaveis: Responsavel[];
  tipoPreSelecionado?: string;
  empresaPreSelecionada?: Empresa | null;
}) {
  const [state, formAction, pending] = useActionState(criarProcesso, undefined);
  const tipoInicial: TipoProcesso =
    tipoPreSelecionado === "ALTERACAO" || tipoPreSelecionado === "ENCERRAMENTO"
      ? tipoPreSelecionado
      : "ABERTURA";
  const [tipoProcesso, setTipoProcesso] = useState<TipoProcesso>(tipoInicial);
  const [fluxoId, setFluxoId] = useState("");

  const fluxosDoTipo = useMemo(
    () => fluxos.filter((f) => f.tipo_processo === tipoProcesso),
    [fluxos, tipoProcesso],
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field label="Tipo de processo" htmlFor="tipoProcesso">
        <Select
          id="tipoProcesso"
          name="tipoProcesso"
          value={tipoProcesso}
          onChange={(e) => {
            setTipoProcesso(e.target.value as TipoProcesso);
            setFluxoId("");
          }}
        >
          <option value="ABERTURA">Abertura de empresa</option>
          <option value="ALTERACAO">Alteração contratual</option>
          <option value="ENCERRAMENTO">Encerramento de empresa</option>
        </Select>
      </Field>

      <Field label="Fluxo" htmlFor="fluxoId" hint="Define o conjunto de fases desse processo">
        <Select id="fluxoId" name="fluxoId" value={fluxoId} onChange={(e) => setFluxoId(e.target.value)} required>
          <option value="">Selecione</option>
          {fluxosDoTipo.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Select>
      </Field>

      {tipoProcesso === "ABERTURA" ? (
        <>
          <Field label="Nome do negócio" htmlFor="nome" hint="A empresa ainda não existe — nasce ao concluir o processo">
            <Input id="nome" name="nome" required />
          </Field>
          <Field label="CNPJ" htmlFor="cnpj" hint="Opcional — preencha se já tiver sido gerado">
            <Input id="cnpj" name="cnpj" placeholder="00.000.000/0000-00" />
          </Field>
        </>
      ) : (
        <>
          <Field label="Empresa" htmlFor="companyId" hint="O nome do processo será o da própria empresa">
            <SeletorEmpresa name="companyId" empresas={empresas} defaultValue={empresaPreSelecionada} required />
          </Field>
        </>
      )}

      {tipoProcesso === "ALTERACAO" && (
        <Field label="O que muda" htmlFor="alteracaoItens">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border p-3">
            {Object.entries(ALTERACAO_ITEM_LABELS).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" name="alteracaoItens" value={value} className="h-4 w-4 rounded border-border accent-brand" />
                {label}
              </label>
            ))}
          </div>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data de início" htmlFor="dataInicio">
          <Input id="dataInicio" name="dataInicio" type="date" defaultValue={hojeSaoPaulo()} required />
        </Field>
        <Field label="Prazo final" htmlFor="prazoFinal" hint="Opcional">
          <Input id="prazoFinal" name="prazoFinal" type="date" />
        </Field>
      </div>

      <Field label="Responsável" htmlFor="responsavelId" hint="Opcional">
        <Select id="responsavelId" name="responsavelId" defaultValue="">
          <option value="">Não definido</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contato — nome" htmlFor="contatoNome" hint="Opcional">
          <Input id="contatoNome" name="contatoNome" />
        </Field>
        <Field label="Contato — e-mail" htmlFor="contatoEmail" hint="Opcional">
          <Input id="contatoEmail" name="contatoEmail" type="email" />
        </Field>
        <Field label="Contato — WhatsApp" htmlFor="contatoWhatsapp" hint="Opcional">
          <Input id="contatoWhatsapp" name="contatoWhatsapp" />
        </Field>
      </div>

      <Field label="Detalhes" htmlFor="detalhes" hint="Opcional">
        <textarea
          id="detalhes"
          name="detalhes"
          rows={4}
          className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
      </Field>

      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Criar processo
        </Button>
        <Link href="/legalizacao/processos" className="text-sm font-medium text-foreground/60 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
