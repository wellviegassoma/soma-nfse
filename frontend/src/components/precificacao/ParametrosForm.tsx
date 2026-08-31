"use client";

import { useActionState } from "react";
import { saveParametros } from "@/lib/actions/precificacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import type { PrecificacaoParametros } from "@/lib/types";

// Alíquota/taxa/desconto ficam armazenados como fração (0.1333) — o campo
// mostra em %, o form action converte de volta (ver precificacao.ts).
// IMPORTANTE: <input type="number"> só aceita ponto como separador decimal
// (é o formato exigido pelo próprio HTML, independente do locale do
// navegador) — nunca trocar por vírgula aqui, senão o browser rejeita o
// value em silêncio e o campo volta vazio. toFixed(4) só evita ruído de
// ponto flutuante (0.1333*100 = 13.329999999999998).
function paraPercentualInput(fracao: number | undefined): string {
  if (fracao == null) return "";
  return String(Number((fracao * 100).toFixed(4)));
}

export function ParametrosForm({
  companyId,
  basePath,
  parametros,
}: {
  companyId: string;
  basePath: string;
  parametros?: PrecificacaoParametros;
}) {
  const [state, formAction, pending] = useActionState(saveParametros, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="basePath" value={basePath} />

      {state?.error && <Alert tone="danger">{state.error}</Alert>}

      <Field
        label="Carga horária mensal (horas)"
        htmlFor="cargaHorariaMensal"
        hint="Total de horas de atendimento disponíveis no mês — usado pra ratear o custo fixo por hora."
      >
        <Input
          id="cargaHorariaMensal"
          name="cargaHorariaMensal"
          type="number"
          step="0.01"
          min={0}
          required
          defaultValue={parametros?.carga_horaria_mensal ?? ""}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Alíquota de imposto (%)" htmlFor="aliquotaImposto">
          <Input
            id="aliquotaImposto"
            name="aliquotaImposto"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            defaultValue={paraPercentualInput(parametros?.aliquota_imposto)}
          />
        </Field>
        <Field label="Taxa de cartão (%)" htmlFor="taxaCartao">
          <Input
            id="taxaCartao"
            name="taxaCartao"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            defaultValue={paraPercentualInput(parametros?.taxa_cartao)}
          />
        </Field>
        <Field label="Desconto padrão (%)" htmlFor="descontoPadrao">
          <Input
            id="descontoPadrao"
            name="descontoPadrao"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            defaultValue={paraPercentualInput(parametros?.desconto_padrao)}
          />
        </Field>
      </div>

      <div>
        <Button type="submit" loading={pending}>
          Salvar parâmetros
        </Button>
      </div>
    </form>
  );
}
