"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
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
  ISS_TIPO_LABELS,
  type Company,
  type IssTipo,
  type NfseAmbiente,
} from "@/lib/types";
import { EnderecoFields } from "./EnderecoFields";

// Mesmo valor de IBGE_PETROPOLIS em lib/iss-petropolis.ts — não importado
// direto porque aquele arquivo é "server-only" (não pode entrar num
// componente client).
const IBGE_PETROPOLIS = "3303906";

export type AnalistaIa = "SERENA" | "NEWTON" | null;

const IA_INFO = {
  SERENA: { nome: "Serena", foto: "/serena.webp", papel: "IA do Simples Nacional", href: "/admin/serena" },
  NEWTON: { nome: "Newton", foto: "/newton.webp", papel: "IA do Lucro Presumido", href: "/admin/newton" },
} as const;

function Secao({
  titulo,
  descricao,
  icone,
  className = "",
  children,
}: {
  titulo: string;
  descricao?: string;
  icone: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6 ${className}`}>
      <header className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">{icone}</span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
          {descricao && <p className="text-xs text-foreground/50">{descricao}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);
const ICONES = {
  pessoas: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  cadastro: "M4 4h16v16H4zM8 9h8M8 13h8M8 17h5",
  tributo: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6",
  iss: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6",
  local: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  nota: "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6",
};

function Check({ name, checked, titulo, texto }: { name: string; checked: boolean; titulo: string; texto: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm text-foreground transition-colors hover:bg-surface-muted/60">
      <input type="checkbox" name={name} defaultChecked={checked} className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-brand" />
      <span>
        <span className="font-medium">{titulo}</span>
        <span className="mt-0.5 block text-xs text-foreground/50">{texto}</span>
      </span>
    </label>
  );
}

export function FiscalForm({
  company,
  equipe,
  analistaIa,
}: {
  company: Company;
  equipe: { id: string; nome: string }[];
  analistaIa: AnalistaIa;
}) {
  const [state, formAction, pending] = useActionState(updateCompanyFiscal, undefined);
  const isPF = company.person_type === "PF";
  const [issTipo, setIssTipo] = useState<IssTipo>(company.iss_tipo);
  // Selects controlados + envio por onSubmit (abaixo): com <form action>, o
  // React 19 reseta o formulário depois de salvar — os <select> voltavam pra
  // primeira opção (regime vazio, ambiente Homologação) e os campos com
  // defaultValue pro valor de quando a página abriu (ex.: próximo número da
  // DPS antigo). Quem salvava de novo gravava esses valores errados.
  const [taxRegime, setTaxRegime] = useState(company.tax_regime ?? "");
  const [regimeEspecial, setRegimeEspecial] = useState(String(company.regime_especial_tributacao ?? 0));
  const [nfseAmbiente, setNfseAmbiente] = useState<NfseAmbiente>(company.nfse_ambiente);
  const [resp, setResp] = useState({
    responsavelContabilId: company.responsavel_contabil_id ?? "",
    responsavelFiscalId: company.responsavel_fiscal_id ?? "",
    responsavelDpId: company.responsavel_dp_id ?? "",
    responsavelLegalizacaoId: company.responsavel_legalizacao_id ?? "",
  });
  const ia = analistaIa ? IA_INFO[analistaIa] : null;

  const selectResp = (campo: keyof typeof resp, rotulo: string) => (
    <Field label={rotulo} htmlFor={campo}>
      <Select id={campo} name={campo} value={resp[campo]} onChange={(e) => setResp((r) => ({ ...r, [campo]: e.target.value }))}>
        <option value="">— sem responsável —</option>
        {equipe.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
        {resp[campo] && !equipe.some((p) => p.id === resp[campo]) && <option value={resp[campo]}>(fora da equipe)</option>}
      </Select>
    </Field>
  );

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => formAction(dados));
      }}
    >
      <input type="hidden" name="companyId" value={company.id} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {/* ------------------------------------------------ Responsáveis */}
        <Secao titulo="Responsáveis" descricao="Quem cuida desta empresa em cada área" icone={<Ico d={ICONES.pessoas} />}>
          {ia && (
            <Link
              href={ia.href}
              className="flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2.5 transition-colors hover:bg-brand/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ia.foto} alt="" className="h-9 w-9 rounded-full object-cover" />
              <span className="leading-tight">
                <span className="block text-sm font-semibold text-foreground">Fiscal: {ia.nome} (IA)</span>
                <span className="block text-xs text-foreground/55">{ia.papel} — a pessoa do Fiscal abaixo fica como apoio</span>
              </span>
            </Link>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {selectResp("responsavelContabilId", "Contabilidade")}
            {selectResp("responsavelFiscalId", ia ? "Fiscal — apoio humano" : "Fiscal")}
            {selectResp("responsavelDpId", "Departamento pessoal")}
            {selectResp("responsavelLegalizacaoId", "Legalização")}
          </div>
        </Secao>

        {/* ------------------------------------------------ Cadastro */}
        <Secao titulo="Cadastro fiscal" descricao="Inscrições e dados de abertura" icone={<Ico d={ICONES.cadastro} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Inscrição municipal" htmlFor="municipalRegistration">
              <Input id="municipalRegistration" name="municipalRegistration" defaultValue={company.municipal_registration ?? ""} />
            </Field>
            <Field
              label="Inscrição estadual"
              htmlFor="inscricaoEstadual"
              hint="Lida sozinha do DeC da SEFAZ-RJ. ISENTO = sem cadastro de ICMS. Vazio = não verificado."
            >
              <Input
                id="inscricaoEstadual"
                name="inscricaoEstadual"
                placeholder="Ex.: 11.940.30-7 ou ISENTO"
                defaultValue={
                  company.inscricao_estadual && /^\d{8}$/.test(company.inscricao_estadual)
                    ? company.inscricao_estadual.replace(/^(\d{2})(\d{3})(\d{2})(\d)$/, "$1.$2.$3-$4")
                    : (company.inscricao_estadual ?? "")
                }
              />
            </Field>
            <Field label="Data de abertura" htmlFor="dataAbertura" hint="Menos de 12 meses = RBT12 proporcional">
              <Input id="dataAbertura" name="dataAbertura" type="date" defaultValue={company.data_abertura ?? ""} />
            </Field>
            <Field label="CNAE principal" htmlFor="cnae">
              <Input id="cnae" name="cnae" defaultValue={company.cnae ?? ""} />
            </Field>
            {company.municipality_ibge_code === IBGE_PETROPOLIS && (
              <Field
                label="CMC no ISS de Petrópolis"
                htmlFor="petropolisCmc"
                hint="Código Municipal do Contribuinte (descoberto uma vez no site da prefeitura)."
              >
                <Input id="petropolisCmc" name="petropolisCmc" defaultValue={company.petropolis_cmc ?? ""} />
              </Field>
            )}
          </div>
        </Secao>

        {/* ------------------------------------------------ Tributação */}
        <Secao titulo="Tributação" descricao="Regime e regras do cálculo de impostos" icone={<Ico d={ICONES.tributo} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!isPF && (
              <Field label="Regime tributário" htmlFor="taxRegime">
                <Select id="taxRegime" name="taxRegime" value={taxRegime} onChange={(e) => setTaxRegime(e.target.value as typeof taxRegime)}>
                  <option value="">Selecione</option>
                  {Object.entries(TAX_REGIME_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Regime especial de tributação" htmlFor="regimeEspecialTributacao">
              <Select id="regimeEspecialTributacao" name="regimeEspecialTributacao" value={regimeEspecial} onChange={(e) => setRegimeEspecial(e.target.value)}>
                {Object.entries(REGIME_ESPECIAL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {value} - {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {!isPF && (
            <div className="flex flex-col gap-2">
              {taxRegime !== "LUCRO_PRESUMIDO" && (
                <Check
                  name="sujeitoFatorR"
                  checked={company.sujeito_fator_r}
                  titulo="Simples · sujeito ao Fator R"
                  texto={
                    <>
                      Decide entre Anexo III e V pela folha ÷ RBT12. Faturamento anterior ao sistema vai na aba{" "}
                      <Link href={`/admin/empresas/${company.id}/rbt12`} className="text-brand underline">
                        RBT12
                      </Link>
                      .
                    </>
                  }
                />
              )}
              {taxRegime !== "SIMPLES_NACIONAL" && (
                <>
                  <Check
                    name="equiparacaoHospitalar"
                    checked={company.equiparacao_hospitalar}
                    titulo="Presumido · equiparação hospitalar"
                    texto="Presunção de 8% IRPJ / 12% CSLL nas notas que se encaixam (Lei 9.249/95). O Newton sugere nota a nota."
                  />
                  <Check
                    name="irpjCsllApuracaoMensal"
                    checked={company.irpj_csll_apuracao_mensal}
                    titulo="Presumido · antecipar IRPJ/CSLL todo mês"
                    texto="Por padrão a guia sai só no 3º mês do trimestre."
                  />
                </>
              )}
              {/* Os checkboxes escondidos continuam valendo o que estava gravado. */}
              {taxRegime === "LUCRO_PRESUMIDO" && company.sujeito_fator_r && <input type="hidden" name="sujeitoFatorR" value="on" />}
              {taxRegime === "SIMPLES_NACIONAL" && company.equiparacao_hospitalar && <input type="hidden" name="equiparacaoHospitalar" value="on" />}
              {taxRegime === "SIMPLES_NACIONAL" && company.irpj_csll_apuracao_mensal && <input type="hidden" name="irpjCsllApuracaoMensal" value="on" />}
            </div>
          )}
        </Secao>

        {/* ------------------------------------------------ ISS */}
        {!isPF && (
          <Secao titulo="ISS" descricao="Como a SOMA calcula o ISS do mês" icone={<Ico d={ICONES.iss} />}>
            <Field label="Tipo de ISS" htmlFor="issTipo" hint="Fixo = sociedade uniprofissional (valor por profissional habilitado).">
              <Select id="issTipo" name="issTipo" value={issTipo} onChange={(e) => setIssTipo(e.target.value as IssTipo)}>
                {Object.entries(ISS_TIPO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            {issTipo === "PERCENTUAL" ? (
              <Field label="Alíquota de ISS do município (%)" htmlFor="issAliquotaPadrao">
                <Input
                  id="issAliquotaPadrao"
                  name="issAliquotaPadrao"
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  defaultValue={company.iss_aliquota_padrao != null ? company.iss_aliquota_padrao * 100 : ""}
                />
              </Field>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Valor por profissional (R$)" htmlFor="issValorFixoProfissional">
                  <Input
                    id="issValorFixoProfissional"
                    name="issValorFixoProfissional"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={company.iss_valor_fixo_profissional ?? ""}
                  />
                </Field>
                <Field label="Profissionais habilitados" htmlFor="issQuantidadeProfissionais">
                  <Input
                    id="issQuantidadeProfissionais"
                    name="issQuantidadeProfissionais"
                    type="number"
                    step="1"
                    min={0}
                    defaultValue={company.iss_quantidade_profissionais ?? ""}
                  />
                </Field>
              </div>
            )}
          </Secao>
        )}

        {/* ------------------------------------------------ NFS-e */}
        <Secao titulo="Emissão de NFS-e" descricao="Ambiente, numeração e regras" icone={<Ico d={ICONES.nota} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Ambiente" htmlFor="nfseAmbiente">
              <Select id="nfseAmbiente" name="nfseAmbiente" value={nfseAmbiente} onChange={(e) => setNfseAmbiente(e.target.value as NfseAmbiente)}>
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
            <Field label="Próximo nº DPS" htmlFor="dpsNextNumber">
              <Input id="dpsNextNumber" name="dpsNextNumber" type="number" min={1} defaultValue={company.dps_next_number} required />
            </Field>
          </div>
          {nfseAmbiente === "PRODUCAO" && <Alert tone="warning">Ambiente de produção — notas emitidas aqui valem fiscalmente.</Alert>}
          <Check
            name="allowRetroactiveEmission"
            checked={company.allow_retroactive_emission}
            titulo="Permitir emissão retroativa"
            texto="Por padrão só se emite com competência no mês corrente."
          />
        </Secao>

        {/* ------------------------------------------------ Endereço */}
        <Secao titulo="Endereço" descricao="Município define a prefeitura do ISS" icone={<Ico d={ICONES.local} />} className="lg:col-span-2 2xl:col-span-1">
          <EnderecoFields
            inicial={{
              cep: company.address_zip ?? "",
              logradouro: company.address_street ?? "",
              numero: company.address_number ?? "",
              complemento: company.address_complement ?? "",
              bairro: company.address_neighborhood ?? "",
              municipio: {
                uf: company.state ?? "",
                municipio: company.municipality_name ?? "",
                ibge: company.municipality_ibge_code ?? "",
              },
            }}
          />
        </Secao>
      </div>

      {/* Barra de salvar fixa no rodapé */}
      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/95 px-5 py-3 shadow-lg backdrop-blur">
        <Button type="submit" loading={pending}>
          Salvar dados fiscais
        </Button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.success && <span className="text-sm text-emerald-600">Dados salvos.</span>}
        {!state && <span className="text-xs text-foreground/45">Responsáveis, cadastro, tributação, ISS, NFS-e e endereço são salvos juntos.</span>}
      </div>
    </form>
  );
}
