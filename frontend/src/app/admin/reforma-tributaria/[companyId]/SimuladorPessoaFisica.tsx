"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { cn } from "@/lib/cn";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import type { AnaliseReforma } from "@/lib/reforma-tributaria/analise";
import { ALIQUOTAS_REFERENCIA, ANOS_SIMULACAO, OPCOES_REDUCAO, type AnoSimulacao } from "@/lib/reforma-tributaria/parametros";
import {
  DEDUCAO_DEPENDENTE_MENSAL,
  DESCONTO_SIMPLIFICADO_MENSAL,
  DIVIDENDOS_ALIQUOTA,
  DIVIDENDOS_LIMITE_MENSAL,
  LIMITE_NANOEMPREENDEDOR,
  NOME_OPCAO,
  REDUTOR_IRPF,
  SALARIO_MINIMO,
  TABELA_IRPF_MENSAL,
  TETO_INSS_MENSAL,
  melhorOpcaoPF,
  simularPessoaFisica,
  type EntradaPessoaFisica,
  type OpcaoPessoaFisica,
} from "@/lib/reforma-tributaria/pessoa-fisica";
import type { RegimeSimulado } from "@/lib/reforma-tributaria/motor";
import { PainelAnalise } from "./PainelAnalise";

type CampoDinheiro = "receitaAnual" | "despesasAnual" | "issAutonomoAnual" | "custoManterPjAnual";
type CampoPct = "custosCreditaveisPct" | "percentualB2b" | "aliquotaIssPj";

const moeda = (v: number) => formatarMoeda(v);

export function SimuladorPessoaFisica({
  companyId,
  inicial,
  sistema,
  analise,
}: {
  companyId: string;
  inicial: EntradaPessoaFisica;
  sistema: EntradaPessoaFisica;
  analise: AnaliseReforma | null;
}) {
  const [e, setE] = useState<EntradaPessoaFisica>(inicial);
  const [ano, setAno] = useState<AnoSimulacao>(2027);

  const porAno = useMemo(() => ANOS_SIMULACAO.map((a) => ({ ano: a, opcoes: simularPessoaFisica(e, a) })), [e]);
  const opcoes = porAno.find((p) => p.ano === ano)!.opcoes;
  const pf = opcoes[0];
  const pfHoje = porAno[0].opcoes[0];
  const melhor = melhorOpcaoPF(opcoes);
  const aliq = ALIQUOTAS_REFERENCIA[ano];
  const melhorPj: RegimeSimulado | null = melhor && melhor.id !== "PF" ? melhor.id : null;

  const dinheiro = (campo: CampoDinheiro) => ({
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
          <h2 className="text-sm font-semibold text-foreground">Dados do profissional (12 meses)</h2>
          <button type="button" onClick={() => setE(sistema)} className="text-xs font-medium text-brand hover:underline">
            Voltar aos dados do sistema
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Receita anual no CPF (R$)" htmlFor="pf-receita" hint={`Média de ${moeda(e.receitaAnual / 12)}/mês`}>
            <Input id="pf-receita" type="number" step="1000" {...dinheiro("receitaAnual")} />
          </Field>
          <Field label="Despesas do livro caixa (R$/ano)" htmlFor="pf-desp" hint="Aluguel do consultório, secretária, material…">
            <Input id="pf-desp" type="number" step="1000" {...dinheiro("despesasAnual")} />
          </Field>
          <Field label="Dependentes (IRPF)" htmlFor="pf-dep">
            <Input
              id="pf-dep"
              type="number"
              min={0}
              step="1"
              value={e.dependentes}
              onChange={(ev) => setE((s) => ({ ...s, dependentes: Math.max(0, Math.floor(Number(ev.target.value) || 0)) }))}
            />
          </Field>
          <Field label="ISS do autônomo (R$/ano)" htmlFor="pf-iss" hint="Valor fixo do município">
            <Input id="pf-iss" type="number" step="100" {...dinheiro("issAutonomoAnual")} />
          </Field>
          <Field label="Redução CBS/IBS da profissão" htmlFor="pf-red">
            <Select
              id="pf-red"
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
          <Field label="Compras com crédito (% receita)" htmlFor="pf-cred">
            <Input id="pf-cred" type="number" step="0.5" {...pct("custosCreditaveisPct")} />
          </Field>
          <Field label="Receita de clientes PJ (%)" htmlFor="pf-b2b" hint="Clínicas/hospitais que aproveitam crédito">
            <Input id="pf-b2b" type="number" step="5" {...pct("percentualB2b")} />
          </Field>
          <Field label="Na PJ: Fator R" htmlFor="pf-fr">
            <Select
              id="pf-fr"
              value={e.sujeitoFatorR ? "1" : "0"}
              onChange={(ev) => setE((s) => ({ ...s, sujeitoFatorR: ev.target.value === "1" }))}
            >
              <option value="1">Sujeito ao Fator R (III ou V)</option>
              <option value="0">Não sujeito (Anexo III)</option>
            </Select>
          </Field>
          <Field label="Na PJ: ISS (%)" htmlFor="pf-isspj" hint="Fora do Simples">
            <Input id="pf-isspj" type="number" step="0.5" {...pct("aliquotaIssPj")} />
          </Field>
          <Field label="Custo de manter a PJ (R$/ano)" htmlFor="pf-custo" hint="Contabilidade, taxas, certificado">
            <Input id="pf-custo" type="number" step="500" {...dinheiro("custoManterPjAnual")} />
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

      {e.receitaAnual <= 0 ? (
        <Card className="p-6 text-sm text-foreground/60">
          Informe a receita anual no CPF acima para simular. Nenhuma nota desse CPF entrou no sistema.
        </Card>
      ) : (
        <>
          <Card className={cn("p-5", melhor && melhor.id !== "PF" ? "border-success/40 bg-success-soft" : "")}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="text-xs text-foreground/55">Hoje (2026, pessoa física) — fica no bolso</div>
                <div className="text-lg font-semibold text-foreground">{moeda(pfHoje.liquido)}</div>
                <div className="text-xs text-foreground/55">tributos {moeda(pfHoje.tributos)} ({formatarPercentual(pfHoje.cargaPct)})</div>
              </div>
              <div>
                <div className="text-xs text-foreground/55">{ano} continuando na pessoa física</div>
                <div className="text-lg font-semibold text-foreground">{moeda(pf.liquido)}</div>
                <div className={cn("text-xs", pf.liquido < pfHoje.liquido ? "text-danger" : "text-success")}>
                  {pf.liquido < pfHoje.liquido ? "−" : "+"}
                  {moeda(Math.abs(pf.liquido - pfHoje.liquido))} vs. hoje
                </div>
              </div>
              <div>
                <div className="text-xs text-foreground/55">Melhor opção em {ano}</div>
                <div className="text-lg font-semibold text-foreground">{melhor ? NOME_OPCAO[melhor.id] : "—"}</div>
                {melhor && melhor.id !== "PF" && (
                  <div className="text-xs text-success">
                    {moeda(melhor.liquidoEfetivo - pf.liquidoEfetivo)}/ano a mais no bolso que na pessoa física
                  </div>
                )}
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {opcoes.map((o) => (
              <CartaoOpcao key={o.id} o={o} melhor={melhor?.id === o.id} mostrarCredito={e.percentualB2b > 0} />
            ))}
          </div>

          <Card className="overflow-x-auto">
            <div className="px-4 pt-4 text-sm font-semibold text-foreground">
              Linha do tempo — quanto fica no bolso por ano
            </div>
            <table className="mt-2 w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-foreground/55">
                  <th className="px-4 py-2 font-medium">Opção</th>
                  {porAno.map((p) => (
                    <th key={p.ano} className="px-3 py-2 text-right font-medium">
                      {p.ano}
                      {!ALIQUOTAS_REFERENCIA[p.ano].oficial && <span className="text-warning">*</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["PF", "SIMPLES", "SIMPLES_HIBRIDO", "LUCRO_PRESUMIDO"] as const).map((id) => (
                  <tr key={id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium text-foreground">{NOME_OPCAO[id]}</td>
                    {porAno.map((p) => {
                      const o = p.opcoes.find((x) => x.id === id)!;
                      const ehMelhor = melhorOpcaoPF(p.opcoes)?.id === id;
                      return (
                        <td
                          key={p.ano}
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            ehMelhor && "font-semibold text-success",
                            !o.elegivel && "text-foreground/30",
                          )}
                        >
                          {o.elegivel ? moeda(o.liquidoEfetivo) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 pb-4 pt-2 text-xs text-foreground/50">
              Verde = mais dinheiro no bolso no ano. * alíquota de CBS/IBS estimada. Na PJ, o pró-labore é escolhido
              entre o salário mínimo e o necessário para o Fator R de 28% — o que deixar mais no bolso.
            </p>
          </Card>
        </>
      )}

      <PainelAnalise
        companyId={companyId}
        analise={analise}
        regimeAtual={null}
        ano={ano}
        sugestao={melhor ? (melhor.id === "PF" ? "SEM_MUDANCA" : "COM_MUDANCA") : null}
        mudancaSugerida={melhorPj}
        rotuloMelhor={melhor ? NOME_OPCAO[melhor.id] : null}
        montarDados={() => ({
          temLivroCaixa: false,
          livroCaixaMediaMensal: null,
          livroCaixaMeses: {},
          entrada: { pf: { ...e } },
        })}
      />

      <ParametrosPF />
      <ChecklistPF />
    </div>
  );
}

function CartaoOpcao({ o, melhor, mostrarCredito }: { o: OpcaoPessoaFisica; melhor: boolean; mostrarCredito: boolean }) {
  return (
    <Card className={cn("flex flex-col p-5", melhor && "ring-2 ring-success/50", !o.elegivel && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{NOME_OPCAO[o.id]}</div>
        {melhor && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">melhor</span>}
      </div>
      {!o.elegivel ? (
        <p className="mt-3 text-sm text-foreground/60">{o.motivoInelegivel}</p>
      ) : (
        <>
          <div className="mt-2 text-xs text-foreground/55">Fica no bolso</div>
          <div className="text-2xl font-semibold text-foreground">{moeda(o.liquido)}</div>
          <div className="text-xs text-foreground/55">
            tributos {moeda(o.tributos)} · {formatarPercentual(o.cargaPct, 2)} da receita
            {o.custoPj > 0 ? ` · custo da PJ ${moeda(o.custoPj)}` : ""}
          </div>
          <ul className="mt-4 flex flex-col gap-1.5 text-sm">
            {o.componentes.map((k) => (
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
                <span className="tabular-nums">{moeda(k.valor)}</span>
              </li>
            ))}
          </ul>
          {mostrarCredito && (
            <div className="mt-4 border-t border-border pt-3 text-xs text-foreground/60">
              <div className="flex justify-between">
                <span>Crédito gerado ao cliente PJ</span>
                <span className="tabular-nums">{moeda(o.creditoGeradoCliente)}</span>
              </div>
              <div className="mt-1 flex justify-between font-medium text-foreground">
                <span>Bolso + valor do crédito ao cliente</span>
                <span className="tabular-nums">{moeda(o.liquidoEfetivo)}</span>
              </div>
            </div>
          )}
          {o.avisos.length > 0 && (
            <ul className="mt-3 list-disc pl-4 text-xs text-foreground/50">
              {o.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function ParametrosPF() {
  return (
    <Card className="p-6 text-xs leading-relaxed text-foreground/65">
      <h2 className="text-sm font-semibold text-foreground">Parâmetros da pessoa física usados (conferir)</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>
          IRPF mensal (tabela desde 05/2025):{" "}
          {TABELA_IRPF_MENSAL.map((f, i) => (
            <span key={i}>
              {i > 0 ? " · " : ""}
              {Number.isFinite(f.ate) ? `até ${moeda(f.ate)}` : "acima"} {formatarPercentual(f.aliquota, 1)}
              {f.deduzir ? ` (−${moeda(f.deduzir)})` : ""}
            </span>
          ))}
          ; desconto simplificado de {moeda(DESCONTO_SIMPLIFICADO_MENSAL)}/mês ou deduções legais (o maior);
          dependente {moeda(DEDUCAO_DEPENDENTE_MENSAL)}/mês.
        </li>
        <li>
          Redutor da Lei 15.270/2025: imposto zerado com rendimento até {moeda(REDUTOR_IRPF.isencaoAte)}/mês; redução de{" "}
          {moeda(REDUTOR_IRPF.constante)} − {REDUTOR_IRPF.fator} × rendimento até {moeda(REDUTOR_IRPF.faixaAte)}/mês.
          Carnê-leão mês a mês, sem o ajuste anual.
        </li>
        <li>
          INSS: autônomo 20% e sócio 11% do pró-labore, até o teto de {moeda(TETO_INSS_MENSAL)}/mês. Pró-labore mínimo
          testado: {moeda(SALARIO_MINIMO)} (salário mínimo — conferir o de 2026).
        </li>
        <li>
          Dividendos isentos até {moeda(DIVIDENDOS_LIMITE_MENSAL)}/mês por sócio; acima disso, retenção de{" "}
          {formatarPercentual(DIVIDENDOS_ALIQUOTA, 0)} (Lei 15.270/2025). Um sócio só.
        </li>
        <li>
          CBS/IBS na pessoa física a partir de 2027 para quem fatura acima de {moeda(LIMITE_NANOEMPREENDEDOR)}/ano (LC
          214, arts. 21 e 26, IV), com a redução da profissão (arts. 127 e 130).
        </li>
      </ul>
    </Card>
  );
}

const CHECKLIST_PF = [
  "Receita acima de R$ 40,5 mil/ano: a pessoa física vira contribuinte de CBS/IBS em 2027 — precisa de inscrição no CNPJ só para isso (não vira empresa) e de emitir documento fiscal com CBS/IBS.",
  "Decidir com antecedência: empresa nova pede o Simples no prazo próprio após a abertura (conferir o prazo da inscrição municipal/estadual); a CBS na PF começa em janeiro/2027.",
  "Profissão regulamentada: a redução de 30% (ou 60% na saúde) na PF só vale se o serviço estiver ligado à habilitação do profissional (LC 214, art. 127, § 1º, I).",
  "Na PJ, a redução de 30% exige sócios habilitados, sem sócio PJ e serviço prestado pelos próprios sócios (art. 127, § 1º, II).",
  "Clientes PJ (clínicas, hospitais): na PF ou no Simples puro o crédito de CBS/IBS que eles aproveitam é pequeno ou nenhum — pode pesar na negociação.",
  "Renda total acima de R$ 600 mil/ano: conferir o IRPF mínimo de alta renda (Lei 15.270/2025), que alcança também os dividendos.",
];

function ChecklistPF() {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-foreground">Checklist 2027 — pessoa física</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-foreground/75">
        {CHECKLIST_PF.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-foreground/50">
        Simulação para planejamento, sem efeito vinculante. Confirmar com o contador responsável antes de orientar o
        cliente.
      </p>
    </Card>
  );
}
