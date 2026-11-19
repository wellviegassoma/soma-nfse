"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import {
  NOME_REGIME,
  fatorR,
  melhorCenario,
  regimeAtualSimulado,
  simularTodos,
  type Cenario,
  type EntradaSimulacao,
} from "@/lib/reforma-tributaria/motor";
import {
  ALIQUOTAS_REFERENCIA,
  ANOS_SIMULACAO,
  OPCOES_REDUCAO,
  type AnoSimulacao,
} from "@/lib/reforma-tributaria/parametros";
import type { TaxRegime } from "@/lib/types";

type CampoNumero = "receitaAnual" | "receitaHospitalarAnual" | "salariosAnual" | "proLaboreAnual" | "fgtsAnual";
type CampoPct = "aliquotaIss" | "custosCreditaveisPct" | "percentualB2b";

export function SimuladorEmpresa({
  taxRegime,
  inicial,
  folhaInformada,
}: {
  taxRegime: TaxRegime | null;
  inicial: EntradaSimulacao;
  folhaInformada: boolean;
}) {
  const [e, setE] = useState<EntradaSimulacao>(inicial);
  const [ano, setAno] = useState<AnoSimulacao>(2027);
  const regimeAtual = regimeAtualSimulado(taxRegime);

  const porAno = useMemo(
    () => ANOS_SIMULACAO.map((a) => ({ ano: a, cenarios: simularTodos(e, a) })),
    [e],
  );
  const cenarios = porAno.find((p) => p.ano === ano)!.cenarios;
  const melhor = melhorCenario(cenarios);
  const atual = regimeAtual ? cenarios.find((c) => c.regime === regimeAtual)! : null;
  const atualHoje = regimeAtual ? porAno[0].cenarios.find((c) => c.regime === regimeAtual)! : null;
  const fr = fatorR(e);
  const aliq = ALIQUOTAS_REFERENCIA[ano];

  const num = (campo: CampoNumero) => ({
    value: Math.round(e[campo] * 100) / 100,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) =>
      setE((s) => ({ ...s, [campo]: Math.max(0, Number(ev.target.value) || 0) })),
  });
  const pct = (campo: CampoPct) => ({
    value: Math.round(e[campo] * 10000) / 100,
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) =>
      setE((s) => ({ ...s, [campo]: Math.min(100, Math.max(0, Number(ev.target.value) || 0)) / 100 })),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Dados do cliente (12 meses)</h2>
          <button
            type="button"
            onClick={() => setE(inicial)}
            className="text-xs font-medium text-brand hover:underline"
          >
            Voltar aos dados do sistema
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Receita anual (R$)" htmlFor="receita">
            <Input id="receita" type="number" step="1000" {...num("receitaAnual")} />
          </Field>
          <Field label="Receita c/ equiparação hospitalar" htmlFor="hosp" hint="Só afeta o Presumido">
            <Input id="hosp" type="number" step="1000" {...num("receitaHospitalarAnual")} />
          </Field>
          <Field label="Salários (R$/ano)" htmlFor="sal" hint={folhaInformada ? undefined : "Sem folha no sistema"}>
            <Input id="sal" type="number" step="1000" {...num("salariosAnual")} />
          </Field>
          <Field label="Pró-labore (R$/ano)" htmlFor="pl">
            <Input id="pl" type="number" step="1000" {...num("proLaboreAnual")} />
          </Field>
          <Field label="FGTS (R$/ano)" htmlFor="fgts">
            <Input id="fgts" type="number" step="100" {...num("fgtsAnual")} />
          </Field>
          <Field
            label="ISS fora do Simples (%)"
            htmlFor="iss"
            hint={e.issFixoAnual != null ? `ISS fixo: ${formatarMoeda(e.issFixoAnual)}/ano` : undefined}
          >
            <Input id="iss" type="number" step="0.5" disabled={e.issFixoAnual != null} {...pct("aliquotaIss")} />
          </Field>
          <Field label="Redução CBS/IBS (cClassTrib)" htmlFor="red">
            <Select
              id="red"
              value={String(e.reducaoCbsIbs)}
              onChange={(ev) => setE((s) => ({ ...s, reducaoCbsIbs: Number(ev.target.value) }))}
            >
              {OPCOES_REDUCAO.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Compras com crédito (% receita)" htmlFor="custos" hint="Aluguel, software, insumos de PJ do regime regular">
            <Input id="custos" type="number" step="0.5" {...pct("custosCreditaveisPct")} />
          </Field>
          <Field label="Receita de clientes PJ (%)" htmlFor="b2b" hint="Clientes que aproveitam crédito de CBS/IBS">
            <Input id="b2b" type="number" step="5" {...pct("percentualB2b")} />
          </Field>
          <Field
            label="Fator R"
            htmlFor="fr"
            hint={fr != null ? `Folha ÷ receita = ${formatarPercentual(fr)} → Anexo ${!e.sujeitoFatorR || fr >= 0.28 ? "III" : "V"}` : undefined}
          >
            <Select
              id="fr"
              value={e.sujeitoFatorR ? "1" : "0"}
              onChange={(ev) => setE((s) => ({ ...s, sujeitoFatorR: ev.target.value === "1" }))}
            >
              <option value="0">Não sujeito (Anexo III)</option>
              <option value="1">Sujeito ao Fator R (III ou V)</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {ANOS_SIMULACAO.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => setAno(a)}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium",
              a === ano ? "border-brand text-brand" : "border-transparent text-foreground/55 hover:text-foreground",
            )}
          >
            {a}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-foreground/55">
          CBS {formatarPercentual(aliq.cbs, 2)} + IBS {formatarPercentual(aliq.ibsUf + aliq.ibsMun, 2)}
          {aliq.oficial ? " · oficial" : " · estimativa"}
        </span>
      </div>

      <Recomendacao ano={ano} atual={atual} atualHoje={atualHoje} melhor={melhor} regimeAtual={regimeAtual} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {cenarios.map((c) => (
          <CartaoCenario
            key={c.regime}
            c={c}
            atual={c.regime === regimeAtual}
            melhor={melhor?.regime === c.regime}
            mostrarCredito={e.percentualB2b > 0}
          />
        ))}
      </div>

      <Card className="overflow-x-auto">
        <div className="px-4 pt-4 text-sm font-semibold text-foreground">Linha do tempo da transição — carga efetiva/ano</div>
        <table className="mt-2 w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground/55">
              <th className="px-4 py-2 font-medium">Regime</th>
              {porAno.map((p) => (
                <th key={p.ano} className="px-3 py-2 text-right font-medium">
                  {p.ano}
                  {!ALIQUOTAS_REFERENCIA[p.ano].oficial && <span className="text-warning">*</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["SIMPLES", "SIMPLES_HIBRIDO", "LUCRO_PRESUMIDO"] as const).map((r) => (
              <tr key={r} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">
                  {NOME_REGIME[r]}
                  {r === regimeAtual && <span className="ml-1 text-xs text-foreground/45">(atual)</span>}
                </td>
                {porAno.map((p) => {
                  const c = p.cenarios.find((x) => x.regime === r)!;
                  const ehMelhor = melhorCenario(p.cenarios)?.regime === r;
                  return (
                    <td
                      key={p.ano}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        ehMelhor && "font-semibold text-success",
                        !c.elegivel && "text-foreground/30",
                      )}
                    >
                      {c.elegivel ? formatarMoeda(c.cargaEfetiva) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 pb-4 pt-2 text-xs text-foreground/50">
          Verde = menor carga no ano. * alíquota estimada (a base oficial da Receita só tem 2026 até o Senado fixar a de
          referência). ISS cai 10 p.p./ano de 2029 a 2032 e acaba em 2033.
        </p>
      </Card>

      <Checklist2027 regimeAtual={regimeAtual} />
    </div>
  );
}

function Recomendacao({
  ano,
  atual,
  atualHoje,
  melhor,
  regimeAtual,
}: {
  ano: AnoSimulacao;
  atual: Cenario | null;
  atualHoje: Cenario | null;
  melhor: Cenario | null;
  regimeAtual: ReturnType<typeof regimeAtualSimulado>;
}) {
  if (!melhor) return null;
  const economia = atual ? atual.cargaEfetiva - melhor.cargaEfetiva : 0;
  const trocar = atual != null && melhor.regime !== regimeAtual && economia > 0.005;
  return (
    <Card className={cn("p-5", trocar ? "border-success/40 bg-success-soft" : "")}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-foreground/55">Hoje (2026, regime atual)</div>
          <div className="text-lg font-semibold text-foreground">{atualHoje ? formatarMoeda(atualHoje.total) : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground/55">{ano} no regime atual</div>
          <div className="text-lg font-semibold text-foreground">{atual ? formatarMoeda(atual.total) : "—"}</div>
          {atual && atualHoje && atualHoje.total > 0 && (
            <div className={cn("text-xs", atual.total > atualHoje.total ? "text-danger" : "text-success")}>
              {atual.total >= atualHoje.total ? "+" : "−"}
              {formatarMoeda(Math.abs(atual.total - atualHoje.total))} vs. hoje
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-foreground/55">Melhor opção em {ano}</div>
          <div className="text-lg font-semibold text-foreground">{NOME_REGIME[melhor.regime]}</div>
          <div className="text-xs text-foreground/60">
            {!regimeAtual
              ? "Regime atual não simulado (Lucro Real / não informado)"
              : trocar
                ? `Economia estimada de ${formatarMoeda(economia)}/ano`
                : "Manter o regime atual"}
          </div>
        </div>
      </div>
    </Card>
  );
}

function CartaoCenario({
  c,
  atual,
  melhor,
  mostrarCredito,
}: {
  c: Cenario;
  atual: boolean;
  melhor: boolean;
  mostrarCredito: boolean;
}) {
  return (
    <Card className={cn("flex flex-col p-5", melhor && "ring-2 ring-success/50", !c.elegivel && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{NOME_REGIME[c.regime]}</div>
        <div className="flex gap-1">
          {atual && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">atual</span>}
          {melhor && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">melhor</span>}
        </div>
      </div>
      {!c.elegivel ? (
        <p className="mt-3 text-sm text-foreground/60">{c.motivoInelegivel}</p>
      ) : (
        <>
          <div className="mt-2 text-2xl font-semibold text-foreground">{formatarMoeda(c.total)}</div>
          <div className="text-xs text-foreground/55">{formatarPercentual(c.aliquotaEfetiva, 2)} da receita</div>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {c.componentes.map((k) => (
              <li key={k.rotulo} className="flex justify-between gap-3">
                <span
                  className={cn(
                    "text-foreground/70",
                    k.destaque === "novo" && "text-brand",
                    k.destaque === "saindo" && "text-warning",
                  )}
                >
                  {k.rotulo}
                </span>
                <span className="tabular-nums">{formatarMoeda(k.valor)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border pt-3 text-xs text-foreground/60">
            <div className="flex justify-between">
              <span>Crédito gerado ao cliente PJ</span>
              <span className="tabular-nums">{formatarMoeda(c.creditoGeradoCliente)}</span>
            </div>
            {mostrarCredito && (
              <div className="mt-1 flex justify-between font-medium text-foreground">
                <span>Carga efetiva (− crédito aproveitado)</span>
                <span className="tabular-nums">{formatarMoeda(c.cargaEfetiva)}</span>
              </div>
            )}
          </div>
          {c.avisos.length > 0 && (
            <ul className="mt-3 list-disc pl-4 text-xs text-foreground/50">
              {c.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

const CHECKLIST_COMUM = [
  "Cadastro de serviços: conferir CST, cClassTrib e cIndOp de cada serviço (aba Serviços da empresa) — é o que define a redução de CBS/IBS e o local do IBS.",
  "NFS-e: grupo IBSCBS preenchido; CBS/IBS calculados “por fora” (não compõem a base de IRPJ/CSLL nem do ISS a partir de 2027). Conferir no DANFSe gerado.",
  "Preço: CBS/IBS são destacados por fora — revisar tabela de preços e propostas, principalmente para clientes PJ.",
  "Contratos longos: incluir cláusula de reequilíbrio pela troca de PIS/COFINS por CBS (LC 214, art. 378).",
  "Fornecedores: preferir quem está no regime regular (crédito cheio); Simples puro gera crédito pequeno.",
  "Fluxo de caixa: preparar para o split payment (recolhimento na liquidação do pagamento).",
  "Imposto Seletivo começa em 2027, mas só para bens prejudiciais à saúde/meio ambiente — em regra não atinge prestadores de serviço.",
  "Retenções federais (IRRF, CSRF 4,65%) continuam; a parte de PIS/COFINS da CSRF muda com a extinção — acompanhar normas da RFB.",
];

const CHECKLIST_SIMPLES = [
  "Decidir: CBS/IBS dentro do DAS (puro) ou por fora (híbrido). Híbrido compensa quando a maior parte da receita vem de PJ que aproveita crédito.",
  "PGDAS-D 2027: a fatia de PIS/COFINS vira CBS; conferir a segregação de receitas e o código de atividade (cAtivSN) na nota.",
  "Troca para o Lucro Presumido só vale para o ano todo: opção na 1ª DARF de IRPJ/CSLL do ano (exclusão do Simples comunicada até janeiro).",
];

const CHECKLIST_PRESUMIDO = [
  "PIS/COFINS acabam na competência 12/2026: última EFD-Contribuições; tirar as rubricas do sistema a partir de 01/2027.",
  "Apuração de CBS/IBS com crédito: guardar notas de compras com CBS/IBS destacado — viram crédito financeiro.",
  "Voltar para o Simples: opção até o último dia útil de janeiro, sem débitos com a RFB/PGFN e dentro do limite de R$ 4,8 mi.",
  "Receita acima de R$ 5 mi: presunção +10% sobre o excedente (LC 224/2025).",
];

function Checklist2027({ regimeAtual }: { regimeAtual: ReturnType<typeof regimeAtualSimulado> }) {
  const especificos =
    regimeAtual === "SIMPLES" ? CHECKLIST_SIMPLES : regimeAtual === "LUCRO_PRESUMIDO" ? CHECKLIST_PRESUMIDO : [];
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-foreground">Checklist 2027 — o que conferir na nota e no sistema</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-foreground/75">
        {[...especificos, ...CHECKLIST_COMUM].map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-foreground/50">
        Simulação sem efeito vinculante (Portaria Cotec nº 342/2026). Confirmar com o contador responsável antes de
        orientar o cliente.
      </p>
    </Card>
  );
}
