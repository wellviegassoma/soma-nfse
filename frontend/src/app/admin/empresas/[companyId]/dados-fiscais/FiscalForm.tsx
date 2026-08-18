"use client";

import { useActionState } from "react";
import { updateCompanyFiscal } from "@/lib/actions/empresas";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { TAX_REGIME_LABELS, AMBIENTE_LABELS, type Company } from "@/lib/types";

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

      <div>
        <Button type="submit" loading={pending}>
          Salvar
        </Button>
      </div>
    </form>
  );
}
