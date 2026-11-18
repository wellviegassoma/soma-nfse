"use client";

import { useActionState, useState } from "react";
import { salvarDadosNovoCliente } from "@/lib/actions/comercial";
import {
  faseDoProcesso,
  montarMensagemNovoCliente,
  origemPorTipo,
  proLaboreSugerido,
  urlCartaoCnpjReceita,
  type DadosEmpresaNovoCliente,
} from "@/lib/comercial/mensagem-novo-cliente";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Prospect = {
  id: string;
  especialidade: string | null;
  tipo_onboarding: string | null;
  novo_cliente_inicio_responsabilidade: string | null;
  novo_cliente_funcionarios: number | null;
  novo_cliente_pro_labore: string | null;
  novo_cliente_fase_legalizacao: string | null;
  novo_cliente_obs: string | null;
};

const textareaClass =
  "w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15";

async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Fallback pra navegador sem permissão de clipboard.
    const el = document.createElement("textarea");
    el.value = texto;
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function MensagemNovoClienteSection({
  prospect,
  empresa,
  podeEditar,
}: {
  prospect: Prospect;
  empresa: DadosEmpresaNovoCliente | null;
  podeEditar: boolean;
}) {
  const [state, formAction, pending] = useActionState(salvarDadosNovoCliente, undefined);
  const [inicio, setInicio] = useState(prospect.novo_cliente_inicio_responsabilidade ?? "");
  const [funcionarios, setFuncionarios] = useState(
    prospect.novo_cliente_funcionarios == null ? "" : String(prospect.novo_cliente_funcionarios),
  );
  const [proLabore, setProLabore] = useState(prospect.novo_cliente_pro_labore ?? "");
  const [fase, setFase] = useState(prospect.novo_cliente_fase_legalizacao ?? "");
  const [obs, setObs] = useState(prospect.novo_cliente_obs ?? "");
  const [aviso, setAviso] = useState<string | null>(null);

  const mensagem = montarMensagemNovoCliente({
    empresa,
    especialidade: prospect.especialidade,
    tipoOnboarding: prospect.tipo_onboarding,
    campos: { inicioResponsabilidade: inicio, funcionarios, proLabore, faseLegalizacao: fase, obs },
  });
  const urlCartao = empresa?.person_type === "PF" ? null : urlCartaoCnpjReceita(empresa?.cnpj ?? null);
  const origem = origemPorTipo(prospect.tipo_onboarding);

  async function handleCopiar() {
    const ok = await copiarTexto(mensagem);
    setAviso(ok ? "Mensagem copiada — é só colar no grupo." : "Não consegui copiar. Selecione o texto e copie à mão.");
  }

  async function handleCartao() {
    if (!urlCartao || !empresa?.cnpj) return;
    await copiarTexto(empresa.cnpj.replace(/\D/g, ""));
    window.open(urlCartao, "_blank", "noopener,noreferrer");
    setAviso("CNPJ copiado. A página da Receita abriu em outra aba: baixe o cartão e anexe junto da mensagem.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="prospectId" value={prospect.id} />
        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {state?.success && !pending && <Alert tone="success">Dados salvos.</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Início da responsabilidade"
            htmlFor="inicioResponsabilidade"
            hint={origem ? `Aparece como "(${origem})", pelo tipo do caso` : "Defina o tipo do caso pra mostrar a origem"}
          >
            <Input
              id="inicioResponsabilidade"
              name="inicioResponsabilidade"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              disabled={!podeEditar}
            />
          </Field>
          <Field label="Funcionários" htmlFor="funcionarios" hint="Quantidade — 0 = Não; vazio = não informado">
            <Input
              id="funcionarios"
              name="funcionarios"
              type="number"
              min={0}
              inputMode="numeric"
              value={funcionarios}
              onChange={(e) => setFuncionarios(e.target.value)}
              disabled={!podeEditar}
            />
          </Field>
        </div>

        <Field
          label="Pró-labore"
          htmlFor="proLabore"
          hint={proLaboreSugerido(empresa) ? `Vazio = "${proLaboreSugerido(empresa)}" (empresa sujeita ao Fator R)` : undefined}
        >
          <Input
            id="proLabore"
            name="proLabore"
            value={proLabore}
            placeholder={proLaboreSugerido(empresa)}
            onChange={(e) => setProLabore(e.target.value)}
            disabled={!podeEditar}
          />
        </Field>

        <Field
          label="Fase atual do processo de legalização"
          htmlFor="faseLegalizacao"
          hint={faseDoProcesso(empresa) ? `Vazio = "${faseDoProcesso(empresa)}" (do processo de Legalização)` : undefined}
        >
          <Input
            id="faseLegalizacao"
            name="faseLegalizacao"
            value={fase}
            placeholder={faseDoProcesso(empresa) || "Ex.: Confirmação das licenças se estão em dia"}
            onChange={(e) => setFase(e.target.value)}
            disabled={!podeEditar}
          />
        </Field>

        <Field label="OBS" htmlFor="obs" hint="Opcional — sem OBS a linha não entra na mensagem">
          <textarea
            id="obs"
            name="obs"
            rows={3}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            disabled={!podeEditar}
            className={textareaClass}
          />
        </Field>

        {podeEditar && (
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              Salvar dados
            </Button>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3">
        <pre className="whitespace-pre-wrap rounded-lg border border-border bg-surface-muted p-4 font-sans text-sm text-foreground">
          {mensagem}
        </pre>
        {aviso && <Alert tone="success">{aviso}</Alert>}
        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={handleCopiar}>
            Copiar mensagem
          </Button>
          {urlCartao ? (
            <Button type="button" variant="secondary" onClick={handleCartao}>
              Cartão CNPJ na Receita ↗
            </Button>
          ) : (
            <span className="self-center text-xs text-foreground/50">Sem CNPJ cadastrado na empresa — sem Cartão CNPJ.</span>
          )}
        </div>
        <p className="text-xs text-foreground/50">
          &quot;—&quot; marca um dado que falta. Copiar usa o que está na tela, mesmo antes de salvar.
        </p>
      </div>
    </div>
  );
}
