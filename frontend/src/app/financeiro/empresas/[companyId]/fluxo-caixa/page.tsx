import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarBRL, formatarDataBr, valorEmAberto } from "@/lib/financeiro";
import { projetarFluxoCaixa } from "@/lib/financeiro-relatorios";
import { mesCorrenteBrasilia, hojeBrasilia, competenciasNoIntervalo } from "@/lib/competencia";

export const metadata = { title: "Financeiro — Fluxo de caixa" };

const MESES_PROJECAO = 12;

function rotuloCompetencia(c: string) {
  const [ano, mes] = c.split("-");
  return `${mes}/${ano.slice(2)}`;
}

/** "2026-09" + n meses. */
function somarCompetencia(c: string, n: number): string {
  const [ano, mes] = c.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function FluxoCaixaPage(
  props: PageProps<"/financeiro/empresas/[companyId]/fluxo-caixa">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [{ data: company }, { data: contasData }, { data: lancData }, { data: abertosData }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name")
        .eq("id", companyId)
        .single(),
      supabase
        .from("extrato_contas_bancarias")
        .select("id, banco, saldo_inicial, data_saldo_inicial")
        .eq("company_id", companyId)
        .eq("ativo", true),
      supabase
        .from("fin_lancamentos")
        .select("conta_id, data, valor")
        .eq("company_id", companyId),
      supabase
        .from("fin_agendamentos")
        .select("tipo, vencimento, previsto_para, valor_liquido, valor_liquidado, descricao")
        .eq("company_id", companyId)
        .in("status", ["ABERTO", "PARCIAL"])
        .order("vencimento"),
    ]);

  if (!company) notFound();

  type Conta = {
    id: string;
    banco: string;
    saldo_inicial: number;
    data_saldo_inicial: string | null;
  };
  type Aberto = {
    tipo: "RECEBER" | "PAGAR";
    vencimento: string;
    previsto_para: string | null;
    valor_liquido: number;
    valor_liquidado: number;
    descricao: string | null;
  };

  const contas = (contasData ?? []) as unknown as Conta[];
  const lancamentos = (lancData ?? []) as unknown as {
    conta_id: string;
    data: string;
    valor: number;
  }[];
  const abertos = (abertosData ?? []) as unknown as Aberto[];

  // Mesma regra da função fin_saldo_conta: saldo inicial + lançamentos a
  // partir da data do saldo inicial.
  let saldoAtual = 0;
  for (const c of contas) {
    saldoAtual += Number(c.saldo_inicial);
    for (const l of lancamentos) {
      if (l.conta_id !== c.id) continue;
      if (c.data_saldo_inicial && l.data < c.data_saldo_inicial) continue;
      saldoAtual += Number(l.valor);
    }
  }

  const mesAtual = mesCorrenteBrasilia();
  const competencias = competenciasNoIntervalo(
    mesAtual,
    somarCompetencia(mesAtual, MESES_PROJECAO - 1),
  );

  const fluxo = projetarFluxoCaixa(
    saldoAtual,
    abertos.map((a) => ({
      tipo: a.tipo,
      vencimento: a.vencimento,
      previstoPara: a.previsto_para,
      emAberto: valorEmAberto(a),
    })),
    competencias,
    mesAtual,
  );

  const hoje = hojeBrasilia();
  const vencidos = abertos.filter((a) => (a.previsto_para ?? a.vencimento) < hoje);
  const totalVencido = vencidos.reduce((s, a) => s + valorEmAberto(a), 0);
  const primeiroNegativo = fluxo.find((p) => p.saldoFinal < 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Fluxo de caixa</h1>
        <p className="mt-1 text-sm text-foreground/60">
          Saldo hoje: <strong className="text-foreground">{formatarBRL(saldoAtual)}</strong>.
          Projeção de {MESES_PROJECAO} meses pela data prevista de pagamento (ou vencimento,
          quando não houver).
        </p>
      </div>

      {primeiroNegativo && (
        <Card className="border-danger/40 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">
            Caixa fica negativo em {rotuloCompetencia(primeiroNegativo.competencia)}:{" "}
            {formatarBRL(primeiroNegativo.saldoFinal)}.
          </p>
        </Card>
      )}

      {vencidos.length > 0 && (
        <Card className="p-4">
          <p className="text-sm text-foreground">
            <strong>{vencidos.length}</strong> conta(s) vencida(s) somando{" "}
            <strong>{formatarBRL(totalVencido)}</strong> — contadas inteiras no primeiro mês da
            projeção, porque vão ser pagas.
          </p>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground/50">
              <th className="px-5 py-3 font-medium">Mês</th>
              <th className="px-5 py-3 text-right font-medium">Entradas</th>
              <th className="px-5 py-3 text-right font-medium">Saídas</th>
              <th className="px-5 py-3 text-right font-medium">Saldo no fim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {fluxo.map((p) => (
              <tr key={p.competencia}>
                <td className="px-5 py-3 font-medium text-foreground">
                  {rotuloCompetencia(p.competencia)}
                </td>
                <td className="px-5 py-3 text-right text-success">
                  {p.entradas ? formatarBRL(p.entradas) : "—"}
                </td>
                <td className="px-5 py-3 text-right text-danger">
                  {p.saidas ? `-${formatarBRL(p.saidas)}` : "—"}
                </td>
                <td
                  className={`px-5 py-3 text-right font-semibold ${
                    p.saldoFinal < 0 ? "text-danger" : "text-foreground"
                  }`}
                >
                  {formatarBRL(p.saldoFinal)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {vencidos.length > 0 && (
        <Card>
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Vencidas e em aberto</h2>
          </div>
          <ul className="divide-y divide-border">
            {vencidos.slice(0, 20).map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {a.descricao || "Sem descrição"}
                  </p>
                  <p className="text-xs text-danger">
                    venceu {formatarDataBr(a.vencimento)} ·{" "}
                    {a.tipo === "PAGAR" ? "a pagar" : "a receber"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-foreground">
                  {formatarBRL(valorEmAberto(a))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
