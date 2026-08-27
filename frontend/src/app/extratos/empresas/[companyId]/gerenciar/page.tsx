import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { mesCorrenteBrasilia, ultimasCompetencias, competenciasNoIntervalo } from "@/lib/competencia";
import { ContaBancariaForm } from "../ContaBancariaForm";
import { DeleteContaBancariaButton } from "../DeleteContaBancariaButton";
import { ExtratoMensalInlineForm } from "../ExtratoMensalInlineForm";
import { PeriodoContaForm } from "../PeriodoContaForm";

export const metadata = { title: "Extratos — Gerenciar" };

const MESES_PADRAO = 12;

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export default async function ExtratosGerenciarPage(
  props: PageProps<"/extratos/empresas/[companyId]/gerenciar">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();
  const mesAtual = mesCorrenteBrasilia();

  const [{ data: company }, { data: contas }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, codigo_banco, agencia, conta, ativo, data_inicio_controle, data_fim_controle")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
  ]);

  if (!company) notFound();

  const contaIds = (contas ?? []).map((c) => c.id);
  const { data: extratos } = contaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("id, conta_id, competencia, entregue, conciliado, nome_arquivo")
        .in("conta_id", contaIds)
    : { data: [] };

  const extratoPorContaCompetencia = new Map(
    (extratos ?? []).map((e) => [`${e.conta_id}-${e.competencia}`, e]),
  );

  const padrao = ultimasCompetencias(mesAtual, MESES_PADRAO);
  const mesesPorConta = new Map(
    (contas ?? []).map((c) => {
      const inicio = c.data_inicio_controle?.slice(0, 7) ?? padrao[padrao.length - 1];
      const fim = c.data_fim_controle?.slice(0, 7) ?? mesAtual;
      return [c.id, competenciasNoIntervalo(inicio, fim).reverse()];
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/extratos/empresas/${companyId}`} className="text-xs text-brand underline">
          ← Voltar para consulta
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Gerenciar contas bancárias e controle de entrega de extrato mês a mês.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Nova conta bancária</h2>
        <ContaBancariaForm companyId={companyId} />
      </Card>

      {(!contas || contas.length === 0) && (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma conta bancária cadastrada ainda.
        </Card>
      )}

      {(contas ?? []).map((conta) => {
        const meses = mesesPorConta.get(conta.id) ?? [];
        return (
          <Card key={conta.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="text-sm font-semibold text-foreground/70">
                {conta.codigo_banco ? `${conta.codigo_banco} — ` : ""}
                {conta.banco} — Ag. {conta.agencia} / Conta {conta.conta}
              </div>
              <DeleteContaBancariaButton contaId={conta.id} companyId={companyId} />
            </div>
            <div className="border-b border-border bg-surface-muted/40 px-5 py-3">
              <PeriodoContaForm
                contaId={conta.id}
                companyId={companyId}
                dataInicioAtual={conta.data_inicio_controle}
                dataFimAtual={conta.data_fim_controle}
              />
            </div>
            <div className="divide-y divide-border">
              {meses.map((mes) => {
                const extrato = extratoPorContaCompetencia.get(`${conta.id}-${mes}`);
                return (
                  <div key={mes} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-16 shrink-0 text-sm font-medium text-foreground">
                      {formatCompetencia(mes)}
                    </div>
                    <ExtratoMensalInlineForm
                      companyId={companyId}
                      contaId={conta.id}
                      competencia={mes}
                      entregueAtual={extrato?.entregue ?? false}
                      conciliadoAtual={extrato?.conciliado ?? false}
                      nomeArquivoAtual={extrato?.nome_arquivo ?? null}
                      extratoId={extrato?.id ?? null}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
