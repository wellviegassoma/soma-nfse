import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import {
  formatarBRL,
  formatarDataBr,
  valorEmAberto,
  totalRetencoes,
  AGENDAMENTO_STATUS_LABELS,
  type AgendamentoTipo,
  type FinAgendamento,
  type FinCategoria,
  type FinCentroCusto,
  type FinContato,
} from "@/lib/financeiro";
import { AgendamentoForm } from "./AgendamentoForm";
import { BaixaForm } from "./BaixaForm";
import { CancelarAgendamentoButton } from "./CancelarAgendamentoButton";
import { RecorrenciaForm } from "./RecorrenciaForm";
import { ToggleRecorrenciaButton } from "./ToggleRecorrenciaButton";
import { GerarRecorrenciasButton } from "./GerarRecorrenciasButton";
import { FREQUENCIA_LABELS, type RecorrenciaFrequencia } from "@/lib/financeiro";
import { hojeBrasilia } from "@/lib/competencia";

type Conta = { id: string; banco: string; agencia: string; conta: string };

type Recorrencia = {
  id: string;
  descricao: string | null;
  valor_bruto: number;
  frequencia: RecorrenciaFrequencia;
  data_inicio: string | null;
  data_fim: string | null;
  gerado_ate: string | null;
  ativa: boolean;
  contato_id: string | null;
};

/**
 * Tela de "A pagar" / "A receber". As duas são a mesma coisa com o sinal
 * trocado, então dividem este componente — o que muda é rótulo e `tipo`.
 */
export async function AgendamentosView({
  companyId,
  tipo,
}: {
  companyId: string;
  tipo: AgendamentoTipo;
}) {
  const supabase = await createClient();
  const [
    { data: company },
    { data: agendamentosData },
    { data: contatosData },
    { data: categoriasData },
    { data: centrosData },
    { data: contasData },
    { data: recorrenciasData },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("fin_agendamentos")
      .select(
        "id, company_id, tipo, contato_id, vencimento, previsto_para, descricao, referencia, detalhamento, valor_bruto, ret_iss, ret_irrf, ret_csll, ret_inss, ret_pis, ret_cofins, ret_outras, desconto, juros, multa, valor_liquido, valor_liquidado, status, parcela_num, parcela_de, reembolsavel",
      )
      .eq("company_id", companyId)
      .eq("tipo", tipo)
      .in("status", ["ABERTO", "PARCIAL"])
      .order("vencimento", { ascending: true }),
    supabase
      .from("fin_contatos")
      .select("id, nome, tipo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("fin_categorias")
      .select("id, nome, grupo, natureza, sistema, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("ordem"),
    supabase
      .from("fin_centros_custo")
      .select("id, nome, ativo")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, agencia, conta")
      .eq("company_id", companyId)
      .eq("ativo", true)
      .order("banco"),
    supabase
      .from("fin_recorrencias")
      .select(
        "id, descricao, valor_bruto, frequencia, data_inicio, data_fim, gerado_ate, ativa, contato_id",
      )
      .eq("company_id", companyId)
      .eq("tipo", tipo)
      .eq("modo", "RECORRENCIA")
      .order("created_at", { ascending: false }),
  ]);

  if (!company) notFound();

  const agendamentos = (agendamentosData ?? []) as unknown as FinAgendamento[];
  const contatos = (contatosData ?? []) as unknown as Pick<
    FinContato,
    "id" | "nome" | "tipo"
  >[];
  // Categoria de sistema não é escolhível na mão: ela é destino de cálculo
  // (juros, multa, desconto, retenção), não classificação de uma conta.
  const categorias = ((categoriasData ?? []) as unknown as FinCategoria[]).filter(
    (c) => !c.sistema,
  );
  const centros = (centrosData ?? []) as unknown as FinCentroCusto[];
  const contas = (contasData ?? []) as unknown as Conta[];
  const recorrencias = (recorrenciasData ?? []) as unknown as Recorrencia[];

  const nomePorContato = new Map(contatos.map((c) => [c.id, c.nome]));
  // toISOString() é UTC: às 21h no Brasil já devolveria o dia seguinte, e
  // contas venceriam "hoje" um dia antes do que deveriam.
  const hoje = hojeBrasilia();

  const totalAberto = agendamentos.reduce((s, a) => s + valorEmAberto(a), 0);
  const vencidos = agendamentos.filter((a) => a.vencimento < hoje);

  const ehPagar = tipo === "PAGAR";
  const titulo = ehPagar ? "Contas a pagar" : "Contas a receber";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {company.trade_name || company.legal_name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{titulo}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {agendamentos.length} em aberto, somando {formatarBRL(totalAberto)}.
          {vencidos.length > 0 && (
            <span className="text-danger"> {vencidos.length} vencido(s).</span>
          )}
        </p>
      </div>

      {categorias.length === 0 ? (
        <Card className="p-6 text-sm text-foreground/60">
          Esta empresa ainda não tem categorias utilizáveis. Ative o financeiro na tela da
          empresa ou crie uma categoria em{" "}
          <Link
            href={`/financeiro/empresas/${companyId}/config`}
            className="text-brand hover:underline"
          >
            Categorias e centros de custo
          </Link>
          .
        </Card>
      ) : (
        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            {ehPagar ? "Agendar pagamento" : "Agendar recebimento"}
          </h2>
          <AgendamentoForm
            companyId={companyId}
            tipo={tipo}
            contatos={contatos}
            categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
            centrosCusto={centros.map((c) => ({ id: c.id, nome: c.nome }))}
          />
        </Card>
      )}

      {categorias.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Recorrências {ehPagar ? "de pagamento" : "de recebimento"}
              </h2>
              <p className="mt-0.5 text-xs text-foreground/55">
                Aluguel, honorário, mensalidade — repetição sem data pra acabar. O sistema
                mantém 12 meses agendados à frente e completa sozinho todo dia.
              </p>
            </div>
            <GerarRecorrenciasButton companyId={companyId} />
          </div>

          <div className="border-b border-border px-5 py-4">
            <RecorrenciaForm
              companyId={companyId}
              tipo={tipo}
              contatos={contatos.map((c) => ({ id: c.id, nome: c.nome }))}
              categorias={categorias.map((c) => ({ id: c.id, nome: c.nome }))}
              centrosCusto={centros.map((c) => ({ id: c.id, nome: c.nome }))}
            />
          </div>

          {recorrencias.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-foreground/55">
              Nenhuma recorrência cadastrada.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {recorrencias.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.descricao || "Sem descrição"}
                      {!r.ativa && (
                        <span className="ml-2 text-xs font-normal text-foreground/40">
                          pausada
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-foreground/55">
                      {formatarBRL(r.valor_bruto)} ·{" "}
                      {FREQUENCIA_LABELS[r.frequencia] ?? r.frequencia}
                      {r.contato_id && ` · ${nomePorContato.get(r.contato_id) ?? "—"}`}
                      {" · desde "}
                      {formatarDataBr(r.data_inicio)}
                      {r.data_fim ? ` até ${formatarDataBr(r.data_fim)}` : " (sem fim)"}
                    </p>
                    <p className="text-xs text-foreground/40">
                      {r.gerado_ate
                        ? `agendado até ${formatarDataBr(r.gerado_ate)}`
                        : "nada gerado ainda"}
                    </p>
                  </div>
                  <ToggleRecorrenciaButton
                    companyId={companyId}
                    recorrenciaId={r.id}
                    ativa={r.ativa}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {agendamentos.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nada em aberto {ehPagar ? "para pagar" : "para receber"}.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {agendamentos.map((a) => {
            const emAberto = valorEmAberto(a);
            const retencoes = totalRetencoes(a);
            const vencido = a.vencimento < hoje;
            return (
              <div key={a.id} className="flex flex-col gap-3 px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {a.descricao || "Sem descrição"}
                      {a.parcela_de && (
                        <span className="ml-2 text-xs font-normal text-foreground/50">
                          parcela {a.parcela_num}/{a.parcela_de}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-foreground/55">
                      {a.contato_id ? nomePorContato.get(a.contato_id) ?? "—" : "sem contato"}
                      {a.referencia && ` · ref ${a.referencia}`}
                      {" · vence "}
                      <span className={vencido ? "font-medium text-danger" : ""}>
                        {formatarDataBr(a.vencimento)}
                      </span>
                      {a.status === "PARCIAL" && (
                        <span className="ml-1 text-warning">
                          · {AGENDAMENTO_STATUS_LABELS.PARCIAL} ({formatarBRL(a.valor_liquidado)}{" "}
                          baixado)
                        </span>
                      )}
                    </p>
                    {retencoes > 0 && (
                      <p className="mt-0.5 text-xs text-foreground/45">
                        bruto {formatarBRL(a.valor_bruto)} · retenções{" "}
                        {formatarBRL(retencoes)}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {formatarBRL(emAberto)}
                    </p>
                    <p className="text-xs text-foreground/45">em aberto</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {contas.length === 0 ? (
                    <p className="text-xs text-foreground/55">
                      Cadastre uma conta bancária no módulo Extratos para poder dar baixa.
                    </p>
                  ) : (
                    <BaixaForm
                      companyId={companyId}
                      agendamentoId={a.id}
                      valorSugerido={emAberto}
                      contas={contas}
                      tipo={tipo}
                    />
                  )}
                  {a.valor_liquidado === 0 && (
                    <CancelarAgendamentoButton
                      companyId={companyId}
                      agendamentoId={a.id}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
