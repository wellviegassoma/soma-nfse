"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { saveService } from "@/lib/actions/servicos";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { RETENCAO_ISSQN_LABELS, type Service } from "@/lib/types";
import {
  ATIVIDADES_SIMPLES_NACIONAL,
  buscarAtividade,
  type TratamentoAtividade,
} from "@/lib/simples-nacional-atividades";
import { sugerirAtividade } from "@/lib/lc116-sugestao-atividade";
import type { ServiceCodeSuggestions } from "./suggestions";

const GRUPOS_TRATAMENTO: { tratamento: TratamentoAtividade; label: string }[] = [
  { tratamento: "ANEXO_III_FIXO", label: "Sempre Anexo III" },
  { tratamento: "FATOR_R", label: "Sujeita ao Fator R (≥28% = III, abaixo = V)" },
  { tratamento: "ANEXO_IV_FIXO", label: "Sempre Anexo IV" },
];

const BADGE_POR_TRATAMENTO: Record<TratamentoAtividade, { label: string; className: string }> = {
  ANEXO_III_FIXO: { label: "Anexo III fixo", className: "bg-green-100 text-green-900" },
  FATOR_R: { label: "Sujeita ao Fator R", className: "bg-amber-100 text-amber-900" },
  ANEXO_IV_FIXO: { label: "Anexo IV fixo", className: "bg-orange-100 text-orange-900" },
};

export function ServiceForm({
  companyId,
  service,
  suggestions,
}: {
  companyId: string;
  service?: Service;
  suggestions?: ServiceCodeSuggestions;
}) {
  const [state, formAction, pending] = useActionState(saveService, undefined);
  const [atividadeId, setAtividadeId] = useState(service?.atividade_simples_nacional ?? "");
  // Só auto-sugere se o campo nunca foi confirmado manualmente nem já
  // veio preenchido do cadastro — evita sobrescrever uma escolha humana
  // só porque o código tributário foi editado depois.
  const [atividadeTocada, setAtividadeTocada] = useState(Boolean(service?.atividade_simples_nacional));
  const atividadeSelecionada = buscarAtividade(atividadeId);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      {service && <input type="hidden" name="serviceId" value={service.id} />}

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground/70">
          O que o cliente vê
        </h2>
        <Field label="Nome exibido" htmlFor="name">
          <Input id="name" name="name" defaultValue={service?.name} required />
        </Field>
        <Field label="Descrição padrão" htmlFor="description">
          <Input
            id="description"
            name="description"
            defaultValue={service?.description ?? ""}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service?.active ?? true}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Ativo
        </label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground/70">
          Dados fiscais (a SOMA configura — o cliente nunca vê isso)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Código tributário nacional" htmlFor="nationalTaxCode">
            <Input
              id="nationalTaxCode"
              name="nationalTaxCode"
              list="nationalTaxCodeOptions"
              defaultValue={service?.national_tax_code ?? ""}
              onBlur={(e) => {
                if (atividadeTocada) return;
                const sugestao = sugerirAtividade(e.target.value);
                if (sugestao) setAtividadeId(sugestao.id);
              }}
            />
            <datalist id="nationalTaxCodeOptions">
              {suggestions?.nationalTaxCodes.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>
          <Field label="Código tributário municipal" htmlFor="municipalTaxCode">
            <Input
              id="municipalTaxCode"
              name="municipalTaxCode"
              defaultValue={service?.municipal_tax_code ?? ""}
            />
          </Field>
          <Field label="NBS" htmlFor="nbs">
            <Input id="nbs" name="nbs" list="nbsOptions" defaultValue={service?.nbs ?? ""} />
            <datalist id="nbsOptions">
              {suggestions?.nbsCodes.map((code) => (
                <option key={code} value={code} />
              ))}
            </datalist>
          </Field>
          <Field label="Alíquota ISS (%)" htmlFor="issRate">
            <Input
              id="issRate"
              name="issRate"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={service?.iss_rate ?? ""}
            />
          </Field>
          <Field label="Retenção do ISS" htmlFor="tipoRetencaoIssqn">
            <Select
              id="tipoRetencaoIssqn"
              name="tipoRetencaoIssqn"
              defaultValue={String(service?.tipo_retencao_issqn ?? 1)}
            >
              {Object.entries(RETENCAO_ISSQN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Atividade no Simples Nacional" htmlFor="atividadeSimplesNacional">
          <Select
            id="atividadeSimplesNacional"
            name="atividadeSimplesNacional"
            value={atividadeId}
            onChange={(e) => {
              setAtividadeId(e.target.value);
              setAtividadeTocada(true);
            }}
          >
            <option value="">Não classificado — escolher depois</option>
            {GRUPOS_TRATAMENTO.map((grupo) => (
              <optgroup key={grupo.tratamento} label={grupo.label}>
                {ATIVIDADES_SIMPLES_NACIONAL.filter((a) => a.tratamento === grupo.tratamento).map(
                  (atividade) => (
                    <option key={atividade.id} value={atividade.id}>
                      {atividade.descricao}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </Select>
          {atividadeSelecionada && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span
                className={`rounded px-2 py-0.5 font-medium ${BADGE_POR_TRATAMENTO[atividadeSelecionada.tratamento].className}`}
              >
                {BADGE_POR_TRATAMENTO[atividadeSelecionada.tratamento].label}
              </span>
              <span className="text-foreground/50">{atividadeSelecionada.citacao}</span>
            </div>
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground/70">
          Tributação (obrigatório para emitir — sem valor, a emissão fica bloqueada)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="% Tributos federais" htmlFor="percFederal">
            <Input
              id="percFederal"
              name="percFederal"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={service?.percentual_total_tributos_federal ?? ""}
            />
          </Field>
          <Field label="% Tributos estaduais" htmlFor="percEstadual">
            <Input
              id="percEstadual"
              name="percEstadual"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={service?.percentual_total_tributos_estadual ?? ""}
            />
          </Field>
          <Field label="% Tributos municipais" htmlFor="percMunicipal">
            <Input
              id="percMunicipal"
              name="percMunicipal"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={service?.percentual_total_tributos_municipal ?? ""}
            />
          </Field>
          <Field label="CST PIS/COFINS" htmlFor="cstPisCofins">
            <Input
              id="cstPisCofins"
              name="cstPisCofins"
              placeholder='"00" para Simples Nacional'
              defaultValue={service?.cst_pis_cofins ?? ""}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground/70">
          PIS/COFINS de apuração própria (só se aplica com CST 01–07)
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Alíquota PIS (%)" htmlFor="aliquotaPis">
            <Input
              id="aliquotaPis"
              name="aliquotaPis"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="0,65"
              defaultValue={service?.aliquota_pis ?? ""}
            />
          </Field>
          <Field label="Alíquota COFINS (%)" htmlFor="aliquotaCofins">
            <Input
              id="aliquotaCofins"
              name="aliquotaCofins"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="3,00"
              defaultValue={service?.aliquota_cofins ?? ""}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-5">
        <h2 className="text-sm font-semibold text-foreground/70">
          Retenção na fonte pelo tomador (IN RFB 1.234/2012)
        </h2>
        <p className="text-xs text-amber-700">
          Atenção: essas retenções (vRetIRRF/vRetCSLL) ainda não foram confirmadas em nenhuma
          nota real aceita pelo Sefin Nacional neste sistema. Teste com um valor pequeno e
          confira o resultado antes de usar em notas de valor alto.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="IRRF retido na fonte (%)" htmlFor="retencaoIrrfAliquota">
            <Input
              id="retencaoIrrfAliquota"
              name="retencaoIrrfAliquota"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="Em branco = não retido. Ex.: 1,5"
              defaultValue={service?.retencao_irrf_aliquota ?? ""}
            />
          </Field>
          <Field label="PIS/COFINS/CSLL retido na fonte (%)" htmlFor="retencaoPisCofinsCsllAliquota">
            <Input
              id="retencaoPisCofinsCsllAliquota"
              name="retencaoPisCofinsCsllAliquota"
              type="number"
              step="0.01"
              min={0}
              max={100}
              placeholder="Em branco = não retido. Ex.: 4,65"
              defaultValue={service?.retencao_pis_cofins_csll_aliquota ?? ""}
            />
          </Field>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
        <Link
          href={`/admin/empresas/${companyId}/servicos`}
          className="text-sm font-medium text-foreground/60 hover:underline"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
