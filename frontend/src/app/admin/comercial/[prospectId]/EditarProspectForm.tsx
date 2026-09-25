"use client";

import { useActionState, useState } from "react";
import { editarProspect, buscarCnpjParaProspect } from "@/lib/actions/comercial";
import { formatarBlocoCnpj, inserirBlocoCnpj } from "@/lib/comercial/formatar-dados-cnpj";
import { DadosAberturaSection } from "../DadosAberturaSection";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";

type Prospect = {
  id: string;
  nome: string;
  tipo_onboarding: string | null;
  pessoa_tipo: string | null;
  especialidade: string | null;
  cidade: string | null;
  origem_lead: string | null;
  indicado_por: string | null;
  regime_tributario: string | null;
  faturamento_medio_estimado: number | null;
  cnpj: string | null;
  cpf: string | null;
  honorario_soma: number | null;
  descricao: string | null;
  abertura_cartorio_jucerja: string | null;
  abertura_capital_social: number | null;
  abertura_divisao_capital: string | null;
  abertura_administrador: string | null;
  abertura_cota_tipo: string | null;
  abertura_cnaes: string | null;
  abertura_opcoes_nome: string | null;
};

export function EditarProspectForm({ prospect, podeEditar }: { prospect: Prospect; podeEditar: boolean }) {
  const [state, formAction, pending] = useActionState(editarProspect, undefined);

  const [cnpj, setCnpj] = useState(prospect.cnpj ?? "");
  const [cidade, setCidade] = useState(prospect.cidade ?? "");
  const [regimeTributario, setRegimeTributario] = useState(prospect.regime_tributario ?? "");
  const [descricao, setDescricao] = useState(prospect.descricao ?? "");
  const [origemLead, setOrigemLead] = useState(prospect.origem_lead ?? "");
  const [tipoOnboarding, setTipoOnboarding] = useState(prospect.tipo_onboarding ?? "");

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
    if (dados.municipio) setCidade(dados.municipio);
    if (dados.simplesNacional) setRegimeTributario("SIMPLES_NACIONAL");
    setDescricao((atual) => inserirBlocoCnpj(atual, formatarBlocoCnpj(dados)));
    setBuscaInfo(
      `${dados.razaoSocial}${dados.municipio ? ` · ${dados.municipio}/${dados.uf}` : ""}${
        dados.ativa ? "" : ` · situação: ${dados.situacaoCadastral ?? "não ativa"}`
      } — dados completos adicionados na descrição.`,
    );
  }

  return (
    <fieldset disabled={!podeEditar} className="contents">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="prospectId" value={prospect.id} />
        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Field label="Nome" htmlFor="nome">
          <Input id="nome" name="nome" defaultValue={prospect.nome} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo do caso" htmlFor="tipoOnboarding">
            <Select
              id="tipoOnboarding"
              name="tipoOnboarding"
              value={tipoOnboarding}
              onChange={(e) => setTipoOnboarding(e.target.value)}
            >
              <option value="">Não definido</option>
              <option value="TRANSICAO_CONTABIL">Transição contábil (já tem CNPJ)</option>
              <option value="ABERTURA_NOVO_CNPJ">Abertura de CNPJ novo</option>
            </Select>
          </Field>
          <Field label="Pessoa" htmlFor="pessoaTipo">
            <Select id="pessoaTipo" name="pessoaTipo" defaultValue={prospect.pessoa_tipo ?? ""}>
              <option value="">Não definido</option>
              <option value="PJ">Pessoa Jurídica</option>
              <option value="PF">Pessoa Física</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="CPF" htmlFor="cpf">
            <Input id="cpf" name="cpf" defaultValue={prospect.cpf ?? ""} />
          </Field>
          <Field label="CNPJ" htmlFor="cnpj" hint="Buscamos os dados automaticamente na Receita Federal">
            <div className="flex gap-2">
              <Input id="cnpj" name="cnpj" value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
              <Button
                type="button"
                variant="secondary"
                loading={buscando}
                disabled={cnpjDigits.length !== 14}
                onClick={handleBuscarCnpj}
              >
                Buscar
              </Button>
            </div>
            {buscaErro && <p className="mt-1.5 text-xs text-danger">{buscaErro}</p>}
            {buscaInfo && <p className="mt-1.5 text-xs text-success">{buscaInfo}</p>}
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Especialidade" htmlFor="especialidade">
            <Input id="especialidade" name="especialidade" defaultValue={prospect.especialidade ?? ""} />
          </Field>
          <Field label="Cidade" htmlFor="cidade">
            <Input id="cidade" name="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Origem do lead" htmlFor="origemLead">
            <Select
              id="origemLead"
              name="origemLead"
              value={origemLead}
              onChange={(e) => setOrigemLead(e.target.value)}
            >
              <option value="">Não definido</option>
              <option value="INSTAGRAM">Instagram</option>
              <option value="AULA">Aula</option>
              <option value="INDICACAO">Indicação</option>
              <option value="OUTRO">Outro</option>
            </Select>
          </Field>
          <Field label="Regime tributário" htmlFor="regimeTributario">
            <Input
              id="regimeTributario"
              name="regimeTributario"
              value={regimeTributario}
              onChange={(e) => setRegimeTributario(e.target.value)}
            />
          </Field>
        </div>

        {origemLead === "INDICACAO" && (
          <Field label="Quem indicou" htmlFor="indicadoPor">
            <Input id="indicadoPor" name="indicadoPor" defaultValue={prospect.indicado_por ?? ""} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Faturamento médio estimado" htmlFor="faturamentoMedioEstimado">
            <Input
              id="faturamentoMedioEstimado"
              name="faturamentoMedioEstimado"
              inputMode="decimal"
              defaultValue={prospect.faturamento_medio_estimado ?? ""}
            />
          </Field>
          <Field label="Honorário SOMA" htmlFor="honorarioSoma">
            <Input
              id="honorarioSoma"
              name="honorarioSoma"
              inputMode="decimal"
              defaultValue={prospect.honorario_soma ?? ""}
            />
          </Field>
        </div>

        <Field label="Descrição" htmlFor="descricao">
          <textarea
            id="descricao"
            name="descricao"
            rows={10}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3.5 py-2.5 text-[15px] text-foreground outline-none transition-shadow focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </Field>

        {tipoOnboarding === "ABERTURA_NOVO_CNPJ" && (
          <DadosAberturaSection
            defaults={{
              cartorioJucerja: prospect.abertura_cartorio_jucerja,
              capitalSocial: prospect.abertura_capital_social,
              divisaoCapital: prospect.abertura_divisao_capital,
              administrador: prospect.abertura_administrador,
              cotaTipo: prospect.abertura_cota_tipo,
              cnaes: prospect.abertura_cnaes,
              opcoesNome: prospect.abertura_opcoes_nome,
            }}
          />
        )}

        {podeEditar && (
          <div>
            <Button type="submit" variant="secondary" loading={pending}>
              Salvar
            </Button>
            {state?.success && <span className="ml-3 text-xs text-success">Salvo</span>}
          </div>
        )}
      </form>
    </fieldset>
  );
}
