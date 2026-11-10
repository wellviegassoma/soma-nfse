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
import { CodigoBusca } from "@/components/ui/CodigoBusca";
import {
  OPCOES_NBS,
  OPCOES_SERVICO_NACIONAL,
  codigosMunicipaisSugeridos,
  nbsSugeridasPara,
} from "@/lib/opcoes-codigos-servico";
import { TAX_REGIME_LABELS, type TaxRegime } from "@/lib/types";
import type { ServiceFormContext } from "./suggestions";

// Tabela de CST do PIS/COFINS aceita na NFS-e nacional, com explicação
// curta pra quem não é da área fiscal.
const CST_PIS_COFINS: { value: string; label: string }[] = [
  { value: "00", label: "00 · Simples Nacional / sem PIS e COFINS próprios na nota" },
  { value: "01", label: "01 · Tributável com alíquota básica (Lucro Presumido ou Real)" },
  { value: "02", label: "02 · Tributável com alíquota diferenciada" },
  { value: "03", label: "03 · Tributável por unidade de medida" },
  { value: "04", label: "04 · Monofásica (revenda com alíquota zero)" },
  { value: "05", label: "05 · Substituição tributária" },
  { value: "06", label: "06 · Alíquota zero" },
  { value: "07", label: "07 · Isenta" },
  { value: "08", label: "08 · Sem incidência" },
  { value: "09", label: "09 · Com suspensão" },
];

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
  context,
}: {
  companyId: string;
  service?: Service;
  context?: ServiceFormContext;
}) {
  const [state, formAction, pending] = useActionState(saveService, undefined);
  const [atividadeId, setAtividadeId] = useState(service?.atividade_simples_nacional ?? "");
  // Só auto-sugere se o campo nunca foi confirmado manualmente nem já
  // veio preenchido do cadastro — evita sobrescrever uma escolha humana
  // só porque o código tributário foi editado depois.
  const [atividadeTocada, setAtividadeTocada] = useState(Boolean(service?.atividade_simples_nacional));
  const atividadeSelecionada = buscarAtividade(atividadeId);

  const [nationalTaxCode, setNationalTaxCode] = useState(service?.national_tax_code ?? "");
  const [nbs, setNbs] = useState(service?.nbs ?? "");
  const [municipalTaxCode, setMunicipalTaxCode] = useState(service?.municipal_tax_code ?? "");
  const nbsSugeridas = nbsSugeridasPara(nationalTaxCode);
  const municipaisSugeridos = codigosMunicipaisSugeridos(context?.municipioIbge, nationalTaxCode);
  const regime = context?.taxRegime as TaxRegime | null | undefined;
  const cstSugerido =
    regime === "SIMPLES_NACIONAL" ? "00" : regime === "LUCRO_PRESUMIDO" || regime === "LUCRO_REAL" ? "01" : "";
  const [cstPisCofins, setCstPisCofins] = useState(service?.cst_pis_cofins ?? cstSugerido);

  function escolherCodigoNacional(codigo: string) {
    setNationalTaxCode(codigo);
    if (!atividadeTocada) {
      const sugestao = sugerirAtividade(codigo);
      if (sugestao) setAtividadeId(sugestao.id);
    }
    // NBS: se ainda vazia, já puxa a mais usada pelos clientes com esse serviço.
    const [maisUsada] = nbsSugeridasPara(codigo);
    if (!nbs && maisUsada) setNbs(maisUsada.codigo);
    const [municipal] = codigosMunicipaisSugeridos(context?.municipioIbge, codigo);
    if (!municipalTaxCode && municipal) setMunicipalTaxCode(municipal.codigo);
  }

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
          <div className="sm:col-span-2">
            <Field
              label="Serviço na lista nacional (código de tributação nacional)"
              htmlFor="nationalTaxCode"
              hint="Digite o que a empresa faz — ex.: “consulta médica”, “odontologia”, “fisioterapia”, “exame” — ou o código."
            >
              <CodigoBusca
                id="nationalTaxCode"
                name="nationalTaxCode"
                value={nationalTaxCode}
                onChange={escolherCodigoNacional}
                opcoes={OPCOES_SERVICO_NACIONAL}
                placeholder="Buscar serviço…"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field
              label="NBS — classificação do serviço (obrigatório para emitir)"
              htmlFor="nbs"
              hint={
                nbsSugeridas.length > 0
                  ? "As primeiras opções são as que os outros clientes da SOMA usam com este serviço e tiveram nota aceita."
                  : "Busque pela descrição (ex.: “médico”, “odontológico”, “laboratório”)."
              }
            >
              <CodigoBusca
                id="nbs"
                name="nbs"
                value={nbs}
                onChange={setNbs}
                opcoes={OPCOES_NBS}
                destaques={nbsSugeridas}
                tituloDestaques="Usadas com este serviço"
                placeholder="Buscar NBS…"
                required
              />
            </Field>
          </div>
          <Field
            label="Código municipal do serviço"
            htmlFor="municipalTaxCode"
            hint={
              municipaisSugeridos.length > 0
                ? undefined
                : "Código da prefeitura (não existe tabela nacional). Em branco, a nota vai sem ele — só preencha se a prefeitura exigir."
            }
          >
            <Input
              id="municipalTaxCode"
              name="municipalTaxCode"
              value={municipalTaxCode}
              onChange={(e) => setMunicipalTaxCode(e.target.value)}
            />
            {municipaisSugeridos.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-foreground/55">
                <span>Aceito em {context?.municipioNome ?? "neste município"}:</span>
                {municipaisSugeridos.map((m) => (
                  <button
                    key={m.codigo}
                    type="button"
                    onClick={() => setMunicipalTaxCode(m.codigo)}
                    className={`rounded border px-1.5 py-0.5 font-mono ${m.codigo === municipalTaxCode ? "border-brand bg-brand/10 text-brand" : "border-border hover:border-brand"}`}
                    title={m.nota}
                  >
                    {m.codigo}
                  </button>
                ))}
              </div>
            )}
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
        <p className="-mt-2 text-xs text-foreground/55">
          Os três percentuais são o “valor aproximado dos tributos” que a nota mostra ao tomador
          (Lei 12.741/2012). Serviço não tem imposto estadual, então o estadual quase sempre é 0.
          No municipal, use a alíquota do ISS. No federal, use a soma aproximada de PIS, COFINS,
          IRPJ e CSLL. No Simples, use a alíquota efetiva do DAS menos o ISS.
        </p>
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
          <Field
            label="CST PIS/COFINS"
            htmlFor="cstPisCofins"
            hint={
              regime
                ? `Empresa no ${TAX_REGIME_LABELS[regime]}${cstSugerido ? ` — o normal é ${cstSugerido}` : ""}.`
                : "Regime da empresa não cadastrado — confira em Dados fiscais."
            }
          >
            <Select
              id="cstPisCofins"
              name="cstPisCofins"
              value={cstPisCofins}
              onChange={(e) => setCstPisCofins(e.target.value)}
            >
              <option value="">Não informar</option>
              {CST_PIS_COFINS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
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
