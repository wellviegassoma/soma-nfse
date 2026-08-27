import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { mesCorrenteBrasilia, ultimasCompetencias } from "@/lib/competencia";
import { ContaBancariaForm } from "./ContaBancariaForm";
import { DeleteContaBancariaButton } from "./DeleteContaBancariaButton";
import { ExtratoMensalInlineForm } from "./ExtratoMensalInlineForm";

export const metadata = { title: "Extratos — Empresa" };

const MESES_EXIBIDOS = 12;

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

export default async function ExtratosEmpresaPage(
  props: PageProps<"/extratos/empresas/[companyId]">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: company }, { data: contas }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trade_name").eq("id", companyId).single(),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, agencia, conta, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("created_at", { ascending: true }),
  ]);

  if (!company) notFound();

  const contaIds = (contas ?? []).map((c) => c.id);
  const { data: extratos } = contaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("id, conta_id, competencia, entregue, nome_arquivo")
        .in("conta_id", contaIds)
    : { data: [] };

  const extratoPorContaCompetencia = new Map(
    (extratos ?? []).map((e) => [`${e.conta_id}-${e.competencia}`, e]),
  );

  const meses = ultimasCompetencias(mesCorrenteBrasilia(), MESES_EXIBIDOS);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/extratos" className="text-xs text-brand underline">
          ← Voltar
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">
          {company.trade_name || company.legal_name}
        </h1>
        <p className="text-sm text-foreground/60">
          Contas bancárias e controle de entrega de extrato mês a mês.
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

      {(contas ?? []).map((conta) => (
        <Card key={conta.id} className="overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
            <div className="text-sm font-semibold text-foreground/70">
              {conta.banco} — Ag. {conta.agencia} / Conta {conta.conta}
            </div>
            <DeleteContaBancariaButton contaId={conta.id} companyId={companyId} />
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
                    nomeArquivoAtual={extrato?.nome_arquivo ?? null}
                    extratoId={extrato?.id ?? null}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
