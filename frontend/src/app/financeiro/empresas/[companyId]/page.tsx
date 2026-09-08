import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarDocumentoEmpresa } from "@/lib/formatters";
import {
  CONTA_TIPO_LABELS,
  formatarBRL,
  valorEmAberto,
  type ContaTipo,
} from "@/lib/financeiro";
import { hojeBrasilia } from "@/lib/competencia";
import { projetarFluxoCaixaDiario, type AgendamentoAberto } from "@/lib/financeiro-relatorios";
import { paginarTudo } from "@/lib/supabase-paginacao";
import { AtivarFinanceiroButton } from "./AtivarFinanceiroButton";
import { FluxoCaixaChart } from "@/components/financeiro/FluxoCaixaChart";
import { ProximasContas, type ProximaConta } from "@/components/financeiro/ProximasContas";

export const metadata = { title: "Financeiro — Empresa" };

const DIAS_FLUXO = 30;
const MAX_ITENS_LISTA = 6;

type Conta = {
  id: string;
  banco: string;
  agencia: string;
  conta: string;
  tipo: ContaTipo;
  saldo_inicial: number;
  data_saldo_inicial: string | null;
};

type AgendamentoAberto2 = {
  id: string;
  tipo: "RECEBER" | "PAGAR";
  contato_id: string | null;
  descricao: string | null;
  vencimento: string;
  previsto_para: string | null;
  valor_liquido: number;
  valor_liquidado: number;
};

export default async function FinanceiroEmpresaPage(
  props: PageProps<"/financeiro/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: contasData }, { data: categorias }, { data: contatos }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name, person_type, cnpj, cpf")
        .eq("id", companyId)
        .single(),
      supabase
        .from("extrato_contas_bancarias")
        .select("id, banco, agencia, conta, tipo, saldo_inicial, data_saldo_inicial")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("created_at", { ascending: true }),
      // .limit(1) basta: só precisamos saber se existe alguma, não a lista
      // inteira (contagem de categorias é decoração de outra tela).
      supabase.from("fin_categorias").select("id").eq("company_id", companyId).limit(1),
      supabase
        .from("fin_contatos")
        .select("id, nome")
        .eq("company_id", companyId)
        .eq("ativo", true),
    ]);

  if (!company) notFound();

  // fin_lancamentos e fin_agendamentos crescem sem teto por empresa (a SOMA
  // já tem ~7.100 de cada, de histórico real importado) — sem paginar, o
  // PostgREST corta em 1000 linhas SEM avisar, e a soma abaixo silenciosamente
  // usaria só uma fração dos dados. Achado ao vivo: o saldo consolidado desta
  // própria tela saiu R$ 646.949,23 em vez de -R$ 2.273,77 antes desta correção.
  const [lancamentosData, abertosData] = await Promise.all([
    paginarTudo<{ conta_id: string; data: string; valor: number }>((from, to) =>
      supabase
        .from("fin_lancamentos")
        .select("conta_id, data, valor")
        .eq("company_id", companyId)
        .range(from, to),
    ),
    paginarTudo<AgendamentoAberto2>((from, to) =>
      supabase
        .from("fin_agendamentos")
        .select(
          "id, tipo, contato_id, descricao, vencimento, previsto_para, valor_liquido, valor_liquidado",
        )
        .eq("company_id", companyId)
        .in("status", ["ABERTO", "PARCIAL"])
        .range(from, to),
    ),
  ]);

  const documento = formatarDocumentoEmpresa(company);
  const contas = (contasData ?? []) as unknown as Conta[];
  const ativo = (categorias ?? []).length > 0;

  if (!ativo) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Link href="/financeiro" className="text-sm text-foreground/55 hover:text-foreground">
            ← Financeiro
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            {company.trade_name || company.legal_name}
          </h1>
          {documento && (
            <p className="mt-1 text-sm text-foreground/60">
              {documento.label} {documento.valor}
            </p>
          )}
        </div>

        <Card className="flex flex-col items-start gap-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Financeiro ainda não ativado
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ativar cria o plano de categorias padrão desta empresa (receitas, custos,
              investimento e financiamento). A partir daí, SOMA e cliente editam o mesmo
              plano — nada aqui é compartilhado com outras empresas.
            </p>
          </div>
          <AtivarFinanceiroButton companyId={companyId} />
        </Card>
      </div>
    );
  }

  // Mesmo cálculo da função fin_saldo_conta no banco: saldo inicial +
  // lançamentos a partir da data do saldo inicial. Feito aqui pra somar
  // todas as contas numa consulta só (ver contas/page.tsx, mesma lógica).
  const saldoPorConta = new Map<string, number>();
  for (const c of contas) saldoPorConta.set(c.id, Number(c.saldo_inicial));
  for (const l of lancamentosData) {
    const conta = contas.find((c) => c.id === l.conta_id);
    if (!conta) continue;
    if (conta.data_saldo_inicial && l.data < conta.data_saldo_inicial) continue;
    saldoPorConta.set(l.conta_id, (saldoPorConta.get(l.conta_id) ?? 0) + Number(l.valor));
  }
  const saldoTotal = [...saldoPorConta.values()].reduce((s, v) => s + v, 0);

  const nomePorContato = new Map(
    ((contatos ?? []) as { id: string; nome: string }[]).map((c) => [c.id, c.nome]),
  );

  const abertos = abertosData;
  const hoje = hojeBrasilia();

  const paraFluxo: AgendamentoAberto[] = abertos.map((a) => ({
    tipo: a.tipo,
    vencimento: a.vencimento,
    previstoPara: a.previsto_para,
    emAberto: valorEmAberto(a),
  }));
  const pontosFluxo = projetarFluxoCaixaDiario(saldoTotal, paraFluxo, hoje, DIAS_FLUXO);

  function montarLista(tipo: "RECEBER" | "PAGAR") {
    const doTipo = abertos
      .filter((a) => a.tipo === tipo)
      .map((a) => {
        const data = a.previsto_para ?? a.vencimento;
        return {
          id: a.id,
          descricao: a.descricao,
          contatoNome: a.contato_id ? nomePorContato.get(a.contato_id) ?? null : null,
          data,
          emAberto: valorEmAberto(a),
          vencido: data < hoje,
        } satisfies ProximaConta;
      })
      .sort((a, b) => a.data.localeCompare(b.data));

    return {
      itens: doTipo.slice(0, MAX_ITENS_LISTA),
      totalEmAberto: doTipo.reduce((s, c) => s + c.emAberto, 0),
      totalVencido: doTipo.filter((c) => c.vencido).reduce((s, c) => s + c.emAberto, 0),
    };
  }

  const receber = montarLista("RECEBER");
  const pagar = montarLista("PAGAR");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/financeiro" className="text-sm text-foreground/55 hover:text-foreground">
          ← Financeiro
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        {documento && (
          <p className="mt-1 text-sm text-foreground/60">
            {documento.label} {documento.valor}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {[
          { href: "receber", label: "Contas a receber" },
          { href: "pagar", label: "Contas a pagar" },
          { href: "contas", label: "Contas e saldos" },
          { href: "conciliacao", label: "Conciliação" },
          { href: "fluxo-caixa", label: "Fluxo de caixa" },
          { href: "painel", label: "Painel de acompanhamento" },
          { href: "cobranca", label: "Cobrança" },
          { href: "orcamento", label: "Orçamento" },
          { href: "contatos", label: "Contatos" },
          { href: "config", label: "Categorias e centros de custo" },
        ].map((l) => (
          <Link
            key={l.href}
            href={`/financeiro/empresas/${companyId}/${l.href}`}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            {l.label}
          </Link>
        ))}
      </div>

      {/* Saldo das contas */}
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Contas</h2>
          <p className="text-lg font-semibold text-foreground">{formatarBRL(saldoTotal)}</p>
        </div>
        {contas.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-foreground/55">
            Nenhuma conta bancária cadastrada para esta empresa.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {contas.map((conta) => (
              <li key={conta.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{conta.banco}</p>
                  <p className="text-xs text-foreground/50">
                    ag {conta.agencia} / cc {conta.conta} ·{" "}
                    {CONTA_TIPO_LABELS[conta.tipo] ?? conta.tipo}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-medium text-foreground">
                  {conta.data_saldo_inicial ? (
                    formatarBRL(saldoPorConta.get(conta.id) ?? 0)
                  ) : (
                    <span className="text-xs font-normal text-warning">sem saldo inicial</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/financeiro/empresas/${companyId}/contas`}
          className="block border-t border-border px-5 py-3 text-center text-sm font-medium text-brand hover:bg-surface-muted"
        >
          Gerenciar contas
        </Link>
      </Card>

      {/* Fluxo de caixa dos próximos 30 dias */}
      <Card className="p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Fluxo de caixa — próximos {DIAS_FLUXO} dias
          </h2>
          <Link
            href={`/financeiro/empresas/${companyId}/fluxo-caixa`}
            className="text-sm font-medium text-brand hover:underline"
          >
            Ver detalhado
          </Link>
        </div>
        <p className="mb-4 text-xs text-foreground/55">
          Projeção a partir do saldo atual, considerando o que já está agendado. Conta vencida
          entra hoje, inteira — ela vai ser paga.
        </p>
        <FluxoCaixaChart pontos={pontosFluxo} />
      </Card>

      {/* Contas a receber / a pagar nos próximos dias */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ProximasContas
          titulo="Contas a receber"
          tipo="RECEBER"
          href={`/financeiro/empresas/${companyId}/receber`}
          itens={receber.itens}
          totalEmAberto={receber.totalEmAberto}
          totalVencido={receber.totalVencido}
        />
        <ProximasContas
          titulo="Contas a pagar"
          tipo="PAGAR"
          href={`/financeiro/empresas/${companyId}/pagar`}
          itens={pagar.itens}
          totalEmAberto={pagar.totalEmAberto}
          totalVencido={pagar.totalVencido}
        />
      </div>
    </div>
  );
}
