"use client";

import { useActionState } from "react";
import { updateCompanyFiscal } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import {
  TAX_REGIME_LABELS,
  AMBIENTE_LABELS,
  REGIME_ESPECIAL_LABELS,
  type Company,
} from "@/lib/types";

export function FiscalForm({ company }: { company: Company }) {
  const [state, formAction, pending] = useActionState(
    updateCompanyFiscal,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="companyId" value={company.id} />

      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Dados salvos.</Alert>}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-foreground/70">Dados fiscais</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Inscrição municipal" htmlFor="municipalRegistration">
            <Input
              id="municipalRegistration"
              name="municipalRegistration"
              defaultValue={company.municipal_registration ?? ""}
            />
          </Field>
          <Field
            label="Data de abertura"
            htmlFor="dataAbertura"
            hint="Usada pra saber se a empresa tem menos de 12 meses (RBT12 projetado proporcionalmente, regra oficial)"
          >
            <Input
              id="dataAbertura"
              name="dataAbertura"
              type="date"
              defaultValue={company.data_abertura ?? ""}
            />
          </Field>
          <Field label="Regime tributário" htmlFor="taxRegime">
            <Select
              id="taxRegime"
              name="taxRegime"
              defaultValue={company.tax_regime ?? ""}
            >
              <option value="">Selecione</option>
              {Object.entries(TAX_REGIME_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="CNAE principal" htmlFor="cnae">
            <Input id="cnae" name="cnae" defaultValue={company.cnae ?? ""} />
          </Field>
          <Field label="Código IBGE do município" htmlFor="municipalityIbgeCode">
            <Input
              id="municipalityIbgeCode"
              name="municipalityIbgeCode"
              defaultValue={company.municipality_ibge_code ?? ""}
            />
          </Field>
          <Field label="Regime especial de tributação" htmlFor="regimeEspecialTributacao">
            <Select
              id="regimeEspecialTributacao"
              name="regimeEspecialTributacao"
              defaultValue={String(company.regime_especial_tributacao ?? 0)}
            >
              {Object.entries(REGIME_ESPECIAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {value} - {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground/70">
          Configuração da NFS-e
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Ambiente" htmlFor="nfseAmbiente">
            <Select
              id="nfseAmbiente"
              name="nfseAmbiente"
              defaultValue={company.nfse_ambiente}
            >
              {Object.entries(AMBIENTE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Série DPS" htmlFor="dpsSeries">
            <Input id="dpsSeries" name="dpsSeries" defaultValue={company.dps_series} required />
          </Field>
          <Field label="Próximo número DPS" htmlFor="dpsNextNumber">
            <Input
              id="dpsNextNumber"
              name="dpsNextNumber"
              type="number"
              min={1}
              defaultValue={company.dps_next_number}
              required
            />
          </Field>
        </div>
        {company.nfse_ambiente === "PRODUCAO" && (
          <Alert tone="warning">
            Ambiente de produção — notas emitidas aqui valem fiscalmente.
          </Alert>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground/70">Regras de emissão</h2>
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="allowRetroactiveEmission"
            defaultChecked={company.allow_retroactive_emission}
            className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
          />
          <span>
            Permitir emissão retroativa
            <span className="block text-xs text-foreground/50">
              Por padrão, só é possível emitir nota com competência no mês corrente (evita
              problema de apuração de imposto no mês errado). Marque para liberar exceção
              nesta empresa.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 className="text-sm font-semibold text-foreground/70">
          Cálculo de imposto (aba Impostos)
        </h2>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Simples Nacional
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="sujeitoFatorR"
              defaultChecked={company.sujeito_fator_r}
              className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
            />
            <span>
              Sujeito ao Fator R (decide entre Anexo III e V)
              <span className="block text-xs text-foreground/50">
                Sem isso, o cálculo usa direto o Anexo III. Com isso marcado, o Fator R
                (folha ÷ RBT12) é calculado sozinho a partir da folha de pagamento informada
                mês a mês na aba Impostos da empresa.
              </span>
            </span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="RBT12 manual (R$)"
              htmlFor="rbt12Manual"
              hint="Só preencha se a empresa já faturava antes de entrar no sistema"
            >
              <Input
                id="rbt12Manual"
                name="rbt12Manual"
                type="number"
                step="0.01"
                min={0}
                defaultValue={company.rbt12_manual ?? ""}
              />
            </Field>
            <Field
              label="Competência de referência"
              htmlFor="rbt12ManualCompetencia"
              hint="RBT12 é uma janela de 12 meses que muda todo mês — esse valor só é usado quando bater exatamente com o mês sendo calculado. Atualize aqui todo mês pra manter válido."
            >
              <Input
                id="rbt12ManualCompetencia"
                name="rbt12ManualCompetencia"
                type="month"
                defaultValue={company.rbt12_manual_competencia ?? ""}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
            Lucro Presumido
          </div>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              name="irpjCsllApuracaoMensal"
              defaultChecked={company.irpj_csll_apuracao_mensal}
              className="mt-0.5 h-4 w-4 rounded border-border accent-brand"
            />
            <span>
              Antecipar IRPJ/CSLL mensalmente
              <span className="block text-xs text-foreground/50">
                Por padrão, IRPJ/CSLL do Lucro Presumido são apurados por trimestre (guia só no
                3º mês). Marque para recolher mês a mês em vez de esperar o trimestre fechar.
              </span>
            </span>
          </label>
          <Field
            label="Alíquota de ISS do município (%)"
            htmlFor="issAliquotaPadrao"
            hint="Usada no cálculo agregado mensal de ISS"
          >
            <Input
              id="issAliquotaPadrao"
              name="issAliquotaPadrao"
              type="number"
              step="0.01"
              min={0}
              max={100}
              defaultValue={
                company.iss_aliquota_padrao != null ? company.iss_aliquota_padrao * 100 : ""
              }
            />
          </Field>
        </div>
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
