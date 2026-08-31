"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { saveProcedimento } from "@/lib/actions/precificacao";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { formatarMoeda, formatarPercentual } from "@/lib/formatters";
import { calcularCustoPorUso, calcularProcedimento } from "@/lib/precificacao/engine";
import type { PrecificacaoInsumo, PrecificacaoProcedimentoComReceita } from "@/lib/types";

type ItemLocal = { insumoId: string; nome: string; custoPorUso: number; quantidade: number };

// Converte string de input (vírgula ou ponto) pra número, tolerando vazio.
function n(v: string): number {
  const parsed = Number(v.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function ProcedimentoForm({
  companyId,
  basePath,
  procedimento,
  insumosDisponiveis,
  custoFixoHora,
  aliquotaImposto,
  taxaCartao,
  descontoPadrao,
  parametrosConfigurados,
}: {
  companyId: string;
  basePath: string;
  procedimento?: PrecificacaoProcedimentoComReceita;
  insumosDisponiveis: PrecificacaoInsumo[];
  custoFixoHora: number;
  aliquotaImposto: number;
  taxaCartao: number;
  descontoPadrao: number;
  parametrosConfigurados: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProcedimento, undefined);

  const [tempoAtendimentoHoras, setTempo] = useState(String(procedimento?.tempo_atendimento_horas ?? ""));
  const [precoVenda, setPreco] = useState(String(procedimento?.preco_venda ?? ""));
  const [custoLaboratorio, setCustoLab] = useState(String(procedimento?.custo_laboratorio ?? ""));
  const [honorarioProfissionalFixo, setHonorario] = useState(
    String(procedimento?.honorario_profissional_fixo ?? ""),
  );
  const [percentualRetrabalho, setRetrabalho] = useState(
    String((procedimento?.percentual_retrabalho ?? 0) * 100),
  );

  const [receita, setReceita] = useState<ItemLocal[]>(
    () =>
      procedimento?.itens.map((item) => ({
        insumoId: item.insumo_id,
        nome: item.insumo.nome,
        custoPorUso: calcularCustoPorUso(item.insumo),
        quantidade: item.quantidade,
      })) ?? [],
  );
  const [novoInsumoId, setNovoInsumoId] = useState("");
  const [novaQuantidade, setNovaQuantidade] = useState("1");

  function adicionarInsumo() {
    const insumo = insumosDisponiveis.find((i) => i.id === novoInsumoId);
    const quantidade = n(novaQuantidade);
    if (!insumo || quantidade <= 0) return;
    setReceita((atual) => {
      const existente = atual.find((item) => item.insumoId === insumo.id);
      if (existente) {
        return atual.map((item) =>
          item.insumoId === insumo.id ? { ...item, quantidade: item.quantidade + quantidade } : item,
        );
      }
      return [
        ...atual,
        { insumoId: insumo.id, nome: insumo.nome, custoPorUso: calcularCustoPorUso(insumo), quantidade },
      ];
    });
    setNovoInsumoId("");
    setNovaQuantidade("1");
  }

  function removerInsumo(insumoId: string) {
    setReceita((atual) => atual.filter((item) => item.insumoId !== insumoId));
  }

  const resultado = useMemo(
    () =>
      calcularProcedimento({
        tempoAtendimentoHoras: n(tempoAtendimentoHoras),
        precoVenda: n(precoVenda),
        custoLaboratorio: n(custoLaboratorio),
        honorarioProfissionalFixo: n(honorarioProfissionalFixo),
        percentualRetrabalho: n(percentualRetrabalho) / 100,
        itensReceita: receita.map((item) => ({ quantidade: item.quantidade, custoPorUso: item.custoPorUso })),
        custoFixoHora,
        aliquotaImposto,
        taxaCartao,
        desconto: descontoPadrao,
      }),
    [tempoAtendimentoHoras, precoVenda, custoLaboratorio, honorarioProfissionalFixo, percentualRetrabalho, receita, custoFixoHora, aliquotaImposto, taxaCartao, descontoPadrao],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="basePath" value={basePath} />
        {procedimento && <input type="hidden" name="procedimentoId" value={procedimento.id} />}
        <input
          type="hidden"
          name="receitaJson"
          value={JSON.stringify(receita.map((item) => ({ insumoId: item.insumoId, quantidade: item.quantidade })))}
        />

        {state?.error && <Alert tone="danger">{state.error}</Alert>}
        {!parametrosConfigurados && (
          <Alert tone="warning">
            Os parâmetros de custo fixo ainda não foram configurados — o custo de cadeira/hora está
            entrando como R$ 0,00 no cálculo abaixo até isso ser preenchido em &quot;Parâmetros&quot;.
          </Alert>
        )}

        <Field label="Nome do procedimento" htmlFor="nome">
          <Input id="nome" name="nome" defaultValue={procedimento?.nome} required />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Especialidade" htmlFor="especialidade">
            <Input
              id="especialidade"
              name="especialidade"
              placeholder="Ex.: Odontologia, Fisioterapia"
              defaultValue={procedimento?.especialidade ?? ""}
            />
          </Field>
          <Field label="Tempo de atendimento (horas)" htmlFor="tempoAtendimentoHoras">
            <Input
              id="tempoAtendimentoHoras"
              name="tempoAtendimentoHoras"
              type="number"
              step="0.01"
              min={0}
              value={tempoAtendimentoHoras}
              onChange={(e) => setTempo(e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Preço de venda (R$)" htmlFor="precoVenda">
            <Input
              id="precoVenda"
              name="precoVenda"
              type="number"
              step="0.01"
              min={0}
              value={precoVenda}
              onChange={(e) => setPreco(e.target.value)}
              required
            />
          </Field>
          <Field label="Custo de laboratório/terceiro (R$)" htmlFor="custoLaboratorio">
            <Input
              id="custoLaboratorio"
              name="custoLaboratorio"
              type="number"
              step="0.01"
              min={0}
              value={custoLaboratorio}
              onChange={(e) => setCustoLab(e.target.value)}
            />
          </Field>
          <Field
            label="Honorário fixo a profissional (R$)"
            htmlFor="honorarioProfissionalFixo"
            hint="Valor fixo pago a um especialista terceiro (ex.: implantodontista, endodontista)"
          >
            <Input
              id="honorarioProfissionalFixo"
              name="honorarioProfissionalFixo"
              type="number"
              step="0.01"
              min={0}
              value={honorarioProfissionalFixo}
              onChange={(e) => setHonorario(e.target.value)}
            />
          </Field>
          <Field label="Retrabalho estimado (%)" htmlFor="percentualRetrabalho">
            <Input
              id="percentualRetrabalho"
              name="percentualRetrabalho"
              type="number"
              step="0.01"
              min={0}
              max={100}
              value={percentualRetrabalho}
              onChange={(e) => setRetrabalho(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={procedimento?.ativo ?? true}
            className="h-4 w-4 rounded border-border accent-brand"
          />
          Ativo
        </label>

        <div className="flex flex-col gap-3 border-t border-border pt-5">
          <h2 className="text-sm font-semibold text-foreground/70">
            Receita — insumos usados neste procedimento
          </h2>

          {receita.length > 0 && (
            <Card className="divide-y divide-border overflow-hidden">
              {receita.map((item) => (
                <div key={item.insumoId} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {item.quantidade}× {item.nome}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-foreground/50">{formatarMoeda(item.quantidade * item.custoPorUso)}</span>
                    <button
                      type="button"
                      onClick={() => removerInsumo(item.insumoId)}
                      className="text-xs font-medium text-danger hover:underline"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_auto]">
            <Select value={novoInsumoId} onChange={(e) => setNovoInsumoId(e.target.value)}>
              <option value="">Selecione um insumo…</option>
              {insumosDisponiveis.map((insumo) => (
                <option key={insumo.id} value={insumo.id}>
                  {insumo.nome}
                </option>
              ))}
            </Select>
            <Input
              type="number"
              step="0.0001"
              min={0}
              placeholder="Qtd."
              value={novaQuantidade}
              onChange={(e) => setNovaQuantidade(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={adicionarInsumo} disabled={!novoInsumoId}>
              + Adicionar
            </Button>
          </div>
          {insumosDisponiveis.length === 0 && (
            <p className="text-xs text-foreground/50">
              Nenhum insumo cadastrado ainda — cadastre em &quot;Insumos&quot; antes de montar a receita.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending}>
            Salvar procedimento
          </Button>
          <Link href={basePath} className="text-sm font-medium text-foreground/60 hover:underline">
            Cancelar
          </Link>
        </div>
      </form>

      <Card className="flex flex-col gap-4 p-5 lg:sticky lg:top-6">
        <h2 className="text-sm font-semibold text-foreground/70">Simulação (ao vivo)</h2>

        <dl className="flex flex-col gap-2 text-sm">
          <Linha label="Custo de material" valor={formatarMoeda(resultado.custoMaterial)} />
          <Linha label="Custo de cadeira/hora" valor={formatarMoeda(resultado.custoFixoProcedimento)} />
          <Linha label="Retrabalho" valor={formatarMoeda(resultado.retrabalhoValor)} />
          <Linha label="Custo total" valor={formatarMoeda(resultado.custoTotal)} destaque />
        </dl>

        <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">Preço cheio</p>
          <Linha label="Imposto" valor={formatarMoeda(resultado.cheio.impostoValor)} />
          <Linha label="Taxa de cartão" valor={formatarMoeda(resultado.cheio.taxaCartaoValor)} />
          <Linha label="Receita líquida" valor={formatarMoeda(resultado.cheio.receitaLiquida)} destaque />
          <Linha label="Margem" valor={formatarPercentual(resultado.cheio.margemPct)} destaque cor={resultado.cheio.margemPct < 0 ? "danger" : undefined} />
        </div>

        {descontoPadrao > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
              Com desconto padrão ({formatarPercentual(descontoPadrao)})
            </p>
            <Linha label="Preço com desconto" valor={formatarMoeda(resultado.comDesconto.precoVenda)} />
            <Linha label="Receita líquida" valor={formatarMoeda(resultado.comDesconto.receitaLiquida)} destaque />
            <Linha
              label="Margem"
              valor={formatarPercentual(resultado.comDesconto.margemPct)}
              destaque
              cor={resultado.comDesconto.margemPct < 0 ? "danger" : undefined}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

function Linha({
  label,
  valor,
  destaque,
  cor,
}: {
  label: string;
  valor: string;
  destaque?: boolean;
  cor?: "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-foreground/60">{label}</dt>
      <dd
        className={
          cor === "danger"
            ? "font-semibold text-danger"
            : destaque
              ? "font-semibold text-foreground"
              : "text-foreground"
        }
      >
        {valor}
      </dd>
    </div>
  );
}
