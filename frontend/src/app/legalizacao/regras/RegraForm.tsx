"use client";

import { useActionState, useState } from "react";
import { salvarRegraVencimento } from "@/lib/actions/legalizacao";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { UfMunicipioFields, type UfMunicipio } from "@/components/UfMunicipioFields";
import { MODO_VENCIMENTO_LABELS, type ModoVencimento } from "@/lib/legalizacao-licencas";

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function RegraForm({ tipos }: { tipos: { id: string; nome: string }[] }) {
  const [state, formAction, pending] = useActionState(salvarRegraVencimento, undefined);
  const [modo, setModo] = useState<ModoVencimento>("DATA_FIXA");
  const [municipio, setMunicipio] = useState<UfMunicipio>({ uf: "", municipio: "", ibge: "" });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground/70">Nova regra (ou substituir a existente)</h2>
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && <Alert tone="success">Regra salva.</Alert>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Tipo de licença" htmlFor="tipoId">
          <Select id="tipoId" name="tipoId" required defaultValue="">
            <option value="" disabled>
              Selecione
            </option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </Select>
        </Field>
        <UfMunicipioFields
          value={municipio}
          onChange={setMunicipio}
          hintMunicipio="Deixe em branco pra regra padrão do tipo (vale onde não houver regra do município)."
        />

        <Field label="Como vence" htmlFor="modo">
          <Select id="modo" name="modo" value={modo} onChange={(e) => setModo(e.target.value as ModoVencimento)}>
            {Object.entries(MODO_VENCIMENTO_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {modo === "DATA_FIXA" && (
          <>
            <Field label="Dia" htmlFor="dia">
              <Input id="dia" name="dia" type="number" min={1} max={31} required />
            </Field>
            <Field label="Mês" htmlFor="mes">
              <Select id="mes" name="mes" required defaultValue="">
                <option value="" disabled>
                  Selecione
                </option>
                {MESES.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        )}
        {modo === "MESES_APOS_EMISSAO" && (
          <Field label="Meses após a emissão" htmlFor="meses">
            <Input id="meses" name="meses" type="number" min={1} max={120} defaultValue={12} required />
          </Field>
        )}
        <Field
          label="Antecedência (dias)"
          htmlFor="antecedenciaDias"
          hint="Quantos dias antes do vencimento a licença passa a contar como “a vencer”."
        >
          <Input id="antecedenciaDias" name="antecedenciaDias" type="number" min={0} max={365} defaultValue={60} />
        </Field>
        <Field label="Observação" htmlFor="observacao" hint="Opcional">
          <Input id="observacao" name="observacao" placeholder="Ex.: renovação pelo Carioca Digital" />
        </Field>
      </div>
      <div>
        <Button type="submit" loading={pending}>
          Salvar regra
        </Button>
      </div>
    </form>
  );
}
