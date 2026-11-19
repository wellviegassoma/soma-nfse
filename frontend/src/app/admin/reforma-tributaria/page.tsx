import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import {
  carregarBasesReforma,
  CUSTOS_CREDITAVEIS_PADRAO,
  B2B_PADRAO,
  type BaseEmpresaReforma,
} from "@/lib/reforma-tributaria/dados";
import {
  melhorOpcaoPF,
  simularPessoaFisica,
  type OpcaoId,
  type OpcaoPessoaFisica,
} from "@/lib/reforma-tributaria/pessoa-fisica";
import {
  NOME_REGIME,
  melhorCenario,
  regimeAtualSimulado,
  simularTodos,
} from "@/lib/reforma-tributaria/motor";
import { ALIQUOTAS_REFERENCIA, ANOS_SIMULACAO, FONTES_OFICIAIS, type AnoSimulacao } from "@/lib/reforma-tributaria/parametros";
import { entradaPessoaFisica, type StatusAnalise } from "@/lib/reforma-tributaria/analise";
import { StatusAnaliseSelect } from "./StatusAnaliseSelect";

export const metadata = { title: "Reforma Tributária — Painel SOMA" };

const SIGLA: Record<string, string> = {
  SIMPLES_NACIONAL: "Simples",
  LUCRO_PRESUMIDO: "Presumido",
  LUCRO_REAL: "Real",
  IMUNE_ISENTO: "Imune/Isento",
};

// Diferença mínima pra recomendar troca: abaixo disso não compensa o
// trabalho/risco de mudar de regime (1% da receita ou R$ 3 mil/ano).
function trocaCompensa(economia: number, receita: number) {
  return economia > Math.max(3_000, receita * 0.01);
}

type ResumoValor = { total: number; aliquotaEfetiva: number };

// CPF (livro caixa / carnê-leão): "hoje" e "no ano" são os tributos na pessoa
// física; a melhor opção compara continuar no CPF × abrir PJ pelo que fica
// no bolso (lib/reforma-tributaria/pessoa-fisica.ts).
function linhaPessoaFisica(b: BaseEmpresaReforma, ano: AnoSimulacao) {
  const entrada = entradaPessoaFisica(b.entradaSistema, b.analise);
  const semReceita = entrada.receitaAnual <= 0;
  const hoje = simularPessoaFisica(entrada, 2026);
  const noAno = simularPessoaFisica(entrada, ano);
  const pf = noAno[0];
  const resumo = (o: OpcaoPessoaFisica): ResumoValor => ({ total: o.tributos, aliquotaEfetiva: o.cargaPct });
  const melhor = semReceita ? null : melhorOpcaoPF(noAno);
  const economia = melhor && melhor.id !== "PF" ? melhor.liquidoEfetivo - pf.liquidoEfetivo : 0;
  const status: StatusAnalise = b.analise?.status ?? "PENDENTE";
  const mudancaPara = status === "COM_MUDANCA" ? (b.analise?.mudancaPara ?? null) : null;
  const destino = mudancaPara ? noAno.find((o) => o.id === mudancaPara) : null;
  return {
    b,
    receitaExibida: entrada.receitaAnual,
    semReceita,
    regimeAtual: null,
    atualHoje: semReceita ? null : resumo(hoje[0]),
    atualNoAno: semReceita ? null : resumo(pf),
    melhor: null,
    melhorPf: melhor?.id ?? null,
    economia,
    recomendarTroca: melhor != null && melhor.id !== "PF" && trocaCompensa(economia, entrada.receitaAnual),
    status,
    mudancaPara,
    economiaMudanca: !semReceita && destino && destino.elegivel ? destino.liquidoEfetivo - pf.liquidoEfetivo : null,
  };
}

// Código do cliente em ordem numérica ("2" antes de "10"); sem código no fim.
function compararCodigo(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "pt-BR", { numeric: true });
}

function lerPercentual(v: string | string[] | undefined, padrao: number) {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n / 100 : padrao;
}

export default async function ReformaTributariaPage(props: PageProps<"/admin/reforma-tributaria">) {
  const sp = await props.searchParams;
  const anoParam = Number(sp.ano);
  const ano: AnoSimulacao = (ANOS_SIMULACAO as readonly number[]).includes(anoParam)
    ? (anoParam as AnoSimulacao)
    : 2027;
  const custos = lerPercentual(sp.custos, CUSTOS_CREDITAVEIS_PADRAO);
  const b2b = lerPercentual(sp.b2b, B2B_PADRAO);
  const filtro = sp.filtro === "troca" || sp.filtro === "sem-receita" ? sp.filtro : "todas";

  const supabase = await createClient();
  const bases = await carregarBasesReforma(supabase, { custosCreditaveisPct: custos, percentualB2b: b2b });

  // Todas as empresas PJ ativas aparecem — inclusive as sem receita no sistema
  // (empresa nova, nota emitida fora do Sefin Nacional etc.), que ficam na
  // lista sem cálculo até a receita ser informada e salva no simulador.
  const linhas = bases
    .map((b) => {
      if (b.pessoaFisica) return linhaPessoaFisica(b, ano);
      const semReceita = b.entrada.receitaAnual + (b.entrada.receitaLivroCaixaAnual ?? 0) <= 0;
      const regimeAtual = regimeAtualSimulado(b.taxRegime);
      const hoje = simularTodos(b.entrada, 2026);
      const noAno = simularTodos(b.entrada, ano);
      const atualHoje = regimeAtual && !semReceita ? hoje.find((c) => c.regime === regimeAtual)! : null;
      const atualNoAno = regimeAtual && !semReceita ? noAno.find((c) => c.regime === regimeAtual)! : null;
      const melhor = semReceita ? null : melhorCenario(noAno);
      const economia = atualNoAno && melhor ? atualNoAno.cargaEfetiva - melhor.cargaEfetiva : 0;
      const recomendarTroca =
        atualNoAno != null && melhor != null && melhor.regime !== regimeAtual && trocaCompensa(economia, b.entrada.receitaAnual);
      const status: StatusAnalise = b.analise?.status ?? "PENDENTE";
      const mudancaPara = status === "COM_MUDANCA" ? (b.analise?.mudancaPara ?? null) : null;
      // Economia da mudança DECIDIDA (pode ser negativa se o contador escolheu
      // um regime que a simulação acha mais caro — ex.: híbrido por causa de cliente PJ).
      const destino = mudancaPara ? noAno.find((c) => c.regime === mudancaPara) : null;
      const economiaMudanca =
        atualNoAno && destino && destino.elegivel ? atualNoAno.cargaEfetiva - destino.cargaEfetiva : null;
      return {
        b,
        receitaExibida: b.entrada.receitaAnual + (b.entrada.receitaLivroCaixaAnual ?? 0),
        semReceita,
        regimeAtual,
        atualHoje: atualHoje as ResumoValor | null,
        atualNoAno: atualNoAno as ResumoValor | null,
        melhor,
        melhorPf: null as OpcaoId | null,
        economia,
        recomendarTroca,
        status,
        mudancaPara,
        economiaMudanca,
      };
    })
    // Não analisadas primeiro; já analisadas (verde/amarelo) vão para o fim.
    // Dentro de cada grupo, pela ordem do código do cliente.
    .sort(
      (x, y) =>
        Number(x.status !== "PENDENTE") - Number(y.status !== "PENDENTE") ||
        compararCodigo(x.b.codigoCliente, y.b.codigoCliente) ||
        x.b.nome.localeCompare(y.b.nome, "pt-BR"),
    );

  const visiveis =
    filtro === "troca"
      ? linhas.filter((l) => l.recomendarTroca)
      : filtro === "sem-receita"
        ? linhas.filter((l) => l.semReceita)
        : linhas;
  const comparaveis = linhas.filter((l) => l.atualHoje && l.atualNoAno);
  const totalHoje = comparaveis.reduce((a, l) => a + l.atualHoje!.total, 0);
  const totalAno = comparaveis.reduce((a, l) => a + l.atualNoAno!.total, 0);
  const comTroca = linhas.filter((l) => l.recomendarTroca);
  const economiaTotal = comTroca.reduce((a, l) => a + l.economia, 0);
  const semReceita = linhas.filter((l) => l.semReceita).length;
  const aliq = ALIQUOTAS_REFERENCIA[ano];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Reforma Tributária — simulador da carteira</h1>
        <p className="text-sm text-foreground/60">
          Imposto de hoje × imposto com CBS/IBS em cada ano da transição, por cliente, e se vale trocar de regime.
          Base: últimos 12 meses de notas e folha do sistema.
        </p>
      </div>

      <Card className="p-6">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[140px]">
            <Field label="Ano simulado" htmlFor="ano">
              <Select id="ano" name="ano" defaultValue={String(ano)}>
                {ANOS_SIMULACAO.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-[200px]">
            <Field label="Compras com crédito (% receita)" htmlFor="custos">
              <Input id="custos" name="custos" type="number" min={0} max={100} step="0.5" defaultValue={custos * 100} />
            </Field>
          </div>
          <div className="w-[200px]">
            <Field label="Receita de clientes PJ (%)" htmlFor="b2b">
              <Input id="b2b" name="b2b" type="number" min={0} max={100} step="5" defaultValue={b2b * 100} />
            </Field>
          </div>
          <div className="w-[220px]">
            <Field label="Mostrar" htmlFor="filtro">
              <Select id="filtro" name="filtro" defaultValue={filtro}>
                <option value="todas">Todos os clientes</option>
                <option value="troca">Só com troca recomendada</option>
                <option value="sem-receita">Só sem receita no sistema</option>
              </Select>
            </Field>
          </div>
          <Button type="submit">Simular</Button>
        </form>
        <p className="mt-4 text-xs text-foreground/55">
          {ano} — CBS {formatarPercentual(aliq.cbs, 2)} + IBS {formatarPercentual(aliq.ibsUf + aliq.ibsMun, 2)}{" "}
          {aliq.oficial ? (
            <span className="font-medium text-success">(alíquota vigente na base oficial)</span>
          ) : (
            <span className="font-medium text-warning">
              (estimativa — a base oficial da Receita ainda não tem a alíquota de {ano}; depende de resolução do Senado)
            </span>
          )}
          . Os percentuais acima valem para todos os clientes nesta tela; ajuste cliente a cliente no simulador
          individual.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Clientes na carteira</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{linhas.length}</div>
          <div className="mt-1 text-xs text-foreground/50">
            {semReceita} sem receita no sistema (aparecem na lista sem cálculo)
          </div>
          <div className="mt-1 text-xs">
            <span className="text-success">{linhas.filter((l) => l.status === "SEM_MUDANCA").length} sem mudança</span>
            {" · "}
            <span className="text-warning">{linhas.filter((l) => l.status === "COM_MUDANCA").length} com mudança</span>
            {" · "}
            <span className="text-foreground/50">{linhas.filter((l) => l.status === "PENDENTE").length} a analisar</span>
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Imposto/ano hoje (regime atual)</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{formatarMoeda(totalHoje)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Imposto/ano em {ano} (mesmo regime)</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{formatarMoeda(totalAno)}</div>
          <div className={cn("mt-1 text-xs", totalAno > totalHoje ? "text-danger" : "text-success")}>
            {totalHoje > 0 ? `${totalAno >= totalHoje ? "+" : ""}${formatarPercentual(totalAno / totalHoje - 1)}` : "—"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Troca de regime recomendada</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{comTroca.length}</div>
          <div className="mt-1 text-xs text-success">economia de {formatarMoeda(economiaTotal)}/ano</div>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1240px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground/55">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Regime</th>
              <th className="px-4 py-3 text-right font-medium">Receita 12m</th>
              <th className="px-4 py-3 text-right font-medium">Hoje</th>
              <th className="px-4 py-3 text-right font-medium">{ano} (mesmo regime)</th>
              <th className="px-4 py-3 font-medium">Melhor opção em {ano}</th>
              <th className="px-4 py-3 text-right font-medium">Economia/ano</th>
              <th className="w-[230px] px-4 py-3 font-medium">Análise</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr
                key={l.b.id}
                className={cn(
                  "border-b border-border/60 last:border-0",
                  l.status === "SEM_MUDANCA" && "bg-success/15 shadow-[inset_4px_0_0_var(--success)]",
                  l.status === "COM_MUDANCA" && "bg-yellow-100 shadow-[inset_4px_0_0_var(--color-yellow-400)]",
                  l.status === "PENDENTE" && "hover:bg-surface-muted/50",
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">
                    {l.b.codigoCliente ? <span className="text-foreground/45">#{l.b.codigoCliente} </span> : null}
                    {l.b.nome}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {l.semReceita ? (
                      <span className="font-medium text-warning">
                        sem receita no sistema — informe no simulador e salve
                      </span>
                    ) : l.b.analise?.entrada
                      ? "dados da análise salva"
                      : l.b.receitaEstimada
                        ? `receita projetada de ${l.b.mesesReceita} mês(es)`
                        : "12 meses de receita"}
                    {l.b.folhaInformada || l.b.analise?.entrada ? "" : " · sem folha"}
                    {l.b.entrada.reducaoCbsIbs > 0 ? ` · redução CBS/IBS ${formatarPercentual(l.b.entrada.reducaoCbsIbs, 0)}` : ""}
                    {l.b.analise?.livroCaixa.tem ? " · com livro caixa" : ""}
                  </div>
                </td>
                <td className="px-4 py-3 text-foreground/70">
                  {l.b.pessoaFisica ? "PF (carnê-leão)" : l.b.taxRegime ? SIGLA[l.b.taxRegime] : "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {formatarMoeda(l.receitaExibida)}
                  {(l.b.entrada.receitaLivroCaixaAnual ?? 0) > 0 && (
                    <div className="text-xs text-foreground/50">
                      PJ + livro caixa {formatarMoeda(l.b.entrada.receitaLivroCaixaAnual ?? 0)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <ValorCenario c={l.atualHoje} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <ValorCenario c={l.atualNoAno} base={l.atualHoje} />
                </td>
                <td className="px-4 py-3">
                  {l.status === "COM_MUDANCA" ? (
                    <div>
                      <span className="inline-flex rounded-full border border-yellow-500 bg-yellow-200 px-2.5 py-0.5 text-xs font-semibold text-yellow-900">
                        {l.mudancaPara
                          ? `${l.b.pessoaFisica ? "Abrir PJ → " : "Mudar → "}${NOME_REGIME[l.mudancaPara]}`
                          : "Mudança a definir"}
                      </span>
                      {(l.melhor || l.melhorPf) && (
                        <div className="mt-1 text-xs text-foreground/50">
                          simulação:{" "}
                          {l.melhorPf
                            ? l.melhorPf === "PF"
                              ? "continuar PF"
                              : `abrir PJ → ${NOME_REGIME[l.melhorPf]}`
                            : l.recomendarTroca && l.melhor
                              ? `trocar → ${NOME_REGIME[l.melhor.regime]}`
                              : "manter"}
                        </div>
                      )}
                    </div>
                  ) : l.melhorPf ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        l.recomendarTroca ? "bg-success-soft text-success" : "bg-surface-muted text-foreground/60",
                      )}
                    >
                      {l.melhorPf === "PF" || !l.recomendarTroca ? "Continuar na PF" : `Abrir PJ → ${NOME_REGIME[l.melhorPf]}`}
                    </span>
                  ) : l.melhor && !l.regimeAtual ? (
                    // Sem regime de PJ para comparar (CPF, Lucro Real, imune ou não informado):
                    // mostra só a melhor opção de PJ simulada.
                    <span className="inline-flex rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
                      {l.b.pessoaFisica ? "Se abrir PJ → " : "Melhor → "}
                      {NOME_REGIME[l.melhor.regime]}
                    </span>
                  ) : l.melhor ? (
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                        l.recomendarTroca ? "bg-success-soft text-success" : "bg-surface-muted text-foreground/60",
                      )}
                    >
                      {l.recomendarTroca ? "Trocar → " : "Manter · "}
                      {l.recomendarTroca ? NOME_REGIME[l.melhor.regime] : NOME_REGIME[l.regimeAtual!]}
                    </span>
                  ) : (
                    "—"
                  )}
                  {!l.regimeAtual && !l.b.pessoaFisica && (
                    <div className="mt-1 text-xs text-foreground/45">regime atual não simulado</div>
                  )}
                  {l.b.pessoaFisica && !l.semReceita && (
                    <div className="mt-1 text-xs text-foreground/45">pela sobra no bolso (IRPF + INSS + CBS/IBS)</div>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">
                  {l.economiaMudanca != null ? (
                    <span className={l.economiaMudanca >= 0 ? "text-success" : "text-danger"}>
                      {l.economiaMudanca >= 0 ? "" : "−"}
                      {formatarMoeda(Math.abs(l.economiaMudanca))}
                    </span>
                  ) : l.recomendarTroca && l.status !== "COM_MUDANCA" ? (
                    <span className="text-success">{formatarMoeda(l.economia)}</span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="px-4 py-3">
                  {/* key: remonta com o que está salvo quando a lista recarrega */}
                  <StatusAnaliseSelect
                    key={`${l.status}-${l.mudancaPara ?? ""}`}
                    companyId={l.b.id}
                    status={l.status}
                    mudancaPara={l.mudancaPara}
                    regimeAtual={l.regimeAtual}
                    sugestao={
                      l.melhorPf
                        ? l.melhorPf === "PF"
                          ? null
                          : l.melhorPf
                        : l.melhor && l.melhor.regime !== l.regimeAtual
                          ? l.melhor.regime
                          : null
                    }
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/reforma-tributaria/${l.b.id}?custos=${custos * 100}&b2b=${b2b * 100}`}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Simular
                  </Link>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-foreground/50">
                  Nenhum cliente nesse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="p-5 text-xs leading-relaxed text-foreground/60">
        <p>
          <strong className="text-foreground/80">Simulação para planejamento, não é apuração.</strong> A Portaria Cotec nº
          342/2026 diz que nem o código oficial tem efeito vinculante — confirme cada troca de regime com o contador
          responsável. Simplificações: receita dos últimos 12 meses repetida no ano simulado; créditos de CBS/IBS sobre
          compras à alíquota cheia; Lucro Real e Anexos I, II e IV do Simples não simulados; INSS patronal fora do
          Simples com RAT 2% + Terceiros 5,8%.
        </p>
        <p className="mt-2">
          Parâmetros da base oficial da Calculadora RTC:{" "}
          {FONTES_OFICIAIS.map((f, i) => (
            <span key={f.url}>
              {i > 0 ? " · " : ""}
              <a href={f.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {f.rotulo}
              </a>
            </span>
          ))}
        </p>
      </Card>
    </div>
  );
}

function ValorCenario({ c, base }: { c: ResumoValor | null; base?: ResumoValor | null }) {
  if (!c) return <span className="text-foreground/40">—</span>;
  const variacao = base && base.total > 0 ? c.total / base.total - 1 : null;
  return (
    <div>
      <div>{formatarMoeda(c.total)}</div>
      <div className="text-xs text-foreground/50">
        {formatarPercentual(c.aliquotaEfetiva, 2)}
        {variacao != null && Math.abs(variacao) >= 0.0005 && (
          <span className={cn("ml-1", variacao > 0 ? "text-danger" : "text-success")}>
            ({variacao > 0 ? "+" : ""}
            {formatarPercentual(variacao)})
          </span>
        )}
      </div>
    </div>
  );
}
