import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarBRL, formatarDataBr, valorEmAberto } from "@/lib/financeiro";
import { ImportarExtratoForm } from "@/components/financeiro/ImportarExtratoForm";
import { LinhaExtrato } from "@/components/financeiro/LinhaExtrato";
import { DesconciliarButton } from "@/components/financeiro/DesconciliarButton";

export const metadata = { title: "Financeiro — Conciliação" };

type Conta = { id: string; banco: string; agencia: string; conta: string };

type Linha = {
  id: string;
  conta_id: string;
  data: string;
  descricao: string;
  documento: string | null;
  valor: number;
  origem: string;
  status: "PENDENTE" | "CONCILIADO" | "IGNORADO";
};

type AgendamentoAberto = {
  id: string;
  tipo: "PAGAR" | "RECEBER";
  descricao: string | null;
  vencimento: string;
  valor_liquido: number;
  valor_liquidado: number;
};

export default async function ConciliacaoPage(
  props: PageProps<"/financeiro/empresas/[companyId]/conciliacao">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [
    { data: company },
    { data: contasData },
    { data: linhasData },
    { data: conciliadasData },
    { data: abertosData },
  ] = await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, trade_name")
        .eq("id", companyId)
        .single(),
      supabase
        .from("extrato_contas_bancarias")
        .select("id, banco, agencia, conta")
        .eq("company_id", companyId)
        .eq("ativo", true)
        .order("banco"),
      supabase
        .from("fin_extrato_linhas")
        .select("id, conta_id, data, descricao, documento, valor, origem, status")
        .eq("company_id", companyId)
        .neq("status", "CONCILIADO")
        .order("data", { ascending: false })
        .limit(300),
      // Conciliadas ficam numa consulta própria e curta: servem só pro
      // "Desfazer" logo depois de um clique errado, não pra navegar histórico.
      supabase
        .from("fin_extrato_linhas")
        .select("id, conta_id, data, descricao, documento, valor, origem, status")
        .eq("company_id", companyId)
        .eq("status", "CONCILIADO")
        .order("data", { ascending: false })
        .limit(20),
      supabase
        .from("fin_agendamentos")
        .select("id, tipo, descricao, vencimento, valor_liquido, valor_liquidado")
        .eq("company_id", companyId)
        .in("status", ["ABERTO", "PARCIAL"])
        .order("vencimento"),
    ]);

  if (!company) notFound();

  const contas = (contasData ?? []) as unknown as Conta[];
  const linhas = (linhasData ?? []) as unknown as Linha[];
  const abertos = (abertosData ?? []) as unknown as AgendamentoAberto[];
  const conciliadas = (conciliadasData ?? []) as unknown as Linha[];

  const pendentes = linhas.filter((l) => l.status === "PENDENTE");
  const ignoradas = linhas.filter((l) => l.status === "IGNORADO");

  /**
   * Mesma regra da função fin_sugerir_conciliacao no banco: mesmo sentido,
   * valor em aberto exato e vencimento até 3 dias da data do extrato. Feito
   * aqui pra sugerir as N linhas de uma vez, em vez de uma consulta por linha.
   */
  function sugestoesPara(linha: Linha) {
    const tipo = Number(linha.valor) < 0 ? "PAGAR" : "RECEBER";
    const alvo = Math.abs(Number(linha.valor));
    const dataLinha = new Date(`${linha.data}T00:00:00Z`).getTime();
    return abertos
      .filter((a) => a.tipo === tipo && Math.abs(valorEmAberto(a) - alvo) < 0.005)
      .map((a) => ({
        ...a,
        distancia: Math.round(
          Math.abs(new Date(`${a.vencimento}T00:00:00Z`).getTime() - dataLinha) / 86400000,
        ),
      }))
      .filter((a) => a.distancia <= 3)
      .sort((a, b) => a.distancia - b.distancia)
      .slice(0, 5);
  }

  const comSugestao = pendentes.filter((l) => sugestoesPara(l).length > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Conciliação</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {pendentes.length} linha(s) pendente(s)
          {comSugestao > 0 && (
            <span className="text-success"> · {comSugestao} com sugestão automática</span>
          )}
          .
        </p>
      </div>

      {contas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhuma conta bancária cadastrada. Cadastre no módulo Extratos antes de importar.
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Importar extrato</h2>
          <p className="mb-4 text-xs text-foreground/55">
            OFX é o caminho recomendado — todo banco exporta e a leitura é exata. CSV funciona
            quando o banco não oferece OFX. Reimportar o mesmo período é seguro: o que já
            entrou não duplica.
          </p>
          <ImportarExtratoForm companyId={companyId} contas={contas} />
        </Card>
      )}

      {pendentes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nada pendente de conciliação.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {pendentes.map((linha) => (
            <LinhaExtrato
              key={linha.id}
              companyId={companyId}
              linha={linha}
              sugestoes={sugestoesPara(linha).map((a) => ({
                id: a.id,
                descricao: a.descricao,
                vencimento: a.vencimento,
                emAberto: valorEmAberto(a),
                distancia: a.distancia,
              }))}
            />
          ))}
        </Card>
      )}

      {conciliadas.length > 0 && (
        <Card>
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Conciliadas recentemente</h2>
            <p className="mt-0.5 text-xs text-foreground/55">
              Desfazer apaga a baixa e devolve a conta pro estado anterior.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {conciliadas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">{l.descricao}</p>
                  <p className="text-xs text-foreground/45">
                    {formatarDataBr(l.data)} · {formatarBRL(l.valor)}
                  </p>
                </div>
                <DesconciliarButton companyId={companyId} linhaId={l.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {ignoradas.length > 0 && (
        <Card>
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Ignoradas{" "}
              <span className="font-normal text-foreground/50">({ignoradas.length})</span>
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {ignoradas.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground/70">{l.descricao}</p>
                  <p className="text-xs text-foreground/45">{formatarDataBr(l.data)}</p>
                </div>
                <span className="shrink-0 text-sm text-foreground/60">
                  {formatarBRL(l.valor)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
