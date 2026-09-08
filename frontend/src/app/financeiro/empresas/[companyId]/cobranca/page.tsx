import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireFinanceiroAccess } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { formatarBRL, formatarDataBr, valorEmAberto } from "@/lib/financeiro";
import { hojeBrasilia } from "@/lib/competencia";
import {
  etapaDevida,
  CANAL_LABELS,
  type EtapaCobranca,
  type CanalCobranca,
} from "@/lib/financeiro-cobranca";
import { AtivarCobrancaButton } from "@/components/financeiro/AtivarCobrancaButton";
import { CobrancaConta } from "@/components/financeiro/CobrancaConta";
import { ReguaCobranca } from "@/components/financeiro/ReguaCobranca";

export const metadata = { title: "Financeiro — Cobrança" };

export default async function CobrancaPage(
  props: PageProps<"/financeiro/empresas/[companyId]/cobranca">,
) {
  const { companyId } = await props.params;
  await requireFinanceiroAccess(companyId);

  const supabase = await createClient();
  const [
    { data: company },
    { data: etapasData },
    { data: contasData },
    { data: contatosData },
    { data: enviosData },
    { data: notasData },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name")
      .eq("id", companyId)
      .single(),
    supabase
      .from("fin_cobranca_etapas")
      .select("id, nome, dias_relativos, canal, template, ativa")
      .eq("company_id", companyId)
      .order("dias_relativos"),
    supabase
      .from("fin_agendamentos")
      .select(
        "id, descricao, vencimento, valor_liquido, valor_liquidado, contato_id, dps_id",
      )
      .eq("company_id", companyId)
      .eq("tipo", "RECEBER")
      .in("status", ["ABERTO", "PARCIAL"])
      .order("vencimento"),
    supabase
      .from("fin_contatos")
      .select("id, nome")
      .eq("company_id", companyId),
    supabase
      .from("fin_cobranca_envios")
      .select("agendamento_id, etapa_id, canal, enviado_em")
      .eq("company_id", companyId),
    // Notas emitidas da empresa, pra oferecer o vínculo manual.
    supabase
      .from("dps")
      .select("id, numero_dps, serie, valor, descricao, data_competencia")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (!company) notFound();

  const etapas = ((etapasData ?? []) as unknown as {
    id: string;
    nome: string;
    dias_relativos: number;
    canal: CanalCobranca;
    template: string;
    ativa: boolean;
  }[]).map<EtapaCobranca>((e) => ({
    id: e.id,
    nome: e.nome,
    diasRelativos: e.dias_relativos,
    canal: e.canal,
    template: e.template,
    ativa: e.ativa,
  }));

  if (etapas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Link
            href={`/financeiro/empresas/${companyId}`}
            className="text-sm text-foreground/55 hover:text-foreground"
          >
            ← {company.trade_name || company.legal_name}
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">Cobrança</h1>
        </div>
        <Card className="flex flex-col items-start gap-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Régua de cobrança ainda não configurada
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Ativar cria uma régua padrão de seis etapas — lembrete três dias antes, aviso no
              vencimento, e avisos de 3, 7, 15 e 30 dias de atraso. Você edita tudo depois.
            </p>
          </div>
          <AtivarCobrancaButton companyId={companyId} />
        </Card>
      </div>
    );
  }

  type Conta = {
    id: string;
    descricao: string | null;
    vencimento: string;
    valor_liquido: number;
    valor_liquidado: number;
    contato_id: string | null;
    dps_id: string | null;
  };

  const contas = (contasData ?? []) as unknown as Conta[];
  const contatos = (contatosData ?? []) as unknown as { id: string; nome: string }[];
  const envios = (enviosData ?? []) as unknown as {
    agendamento_id: string;
    etapa_id: string | null;
    canal: string;
    enviado_em: string;
  }[];
  const notas = (notasData ?? []) as unknown as {
    id: string;
    numero_dps: number;
    serie: string;
    valor: number;
    descricao: string;
    data_competencia: string;
  }[];

  const nomePorContato = new Map(contatos.map((c) => [c.id, c.nome]));
  const enviadasPorConta = new Map<string, Set<string>>();
  for (const e of envios) {
    if (!e.etapa_id) continue;
    const set = enviadasPorConta.get(e.agendamento_id) ?? new Set<string>();
    set.add(e.etapa_id);
    enviadasPorConta.set(e.agendamento_id, set);
  }

  const notasVinculadas = new Set(contas.map((c) => c.dps_id).filter(Boolean) as string[]);
  const notasDisponiveis = notas.filter((n) => !notasVinculadas.has(n.id));
  const notaPorId = new Map(notas.map((n) => [n.id, n]));

  const hoje = hojeBrasilia();
  const nomeEmpresa = company.trade_name || company.legal_name;

  const itens = contas.map((c) => {
    const devida = etapaDevida(
      {
        agendamentoId: c.id,
        descricao: c.descricao,
        vencimento: c.vencimento,
        emAberto: valorEmAberto(c),
        contatoNome: c.contato_id ? nomePorContato.get(c.contato_id) ?? null : null,
        etapasJaEnviadas: enviadasPorConta.get(c.id) ?? new Set(),
      },
      etapas,
      hoje,
      nomeEmpresa,
    );
    return { conta: c, devida };
  });

  const aCobrarHoje = itens.filter((i) => i.devida);
  const emDia = itens.filter((i) => !i.devida);
  const semNota = contas.filter((c) => !c.dps_id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href={`/financeiro/empresas/${companyId}`}
          className="text-sm text-foreground/55 hover:text-foreground"
        >
          ← {nomeEmpresa}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">Cobrança</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {aCobrarHoje.length} conta(s) para cobrar hoje · {semNota.length} sem NFS-e vinculada.
        </p>
      </div>

      <Card className="border-warning/40 bg-warning-soft p-4">
        <p className="text-sm text-foreground">
          <strong>O sistema não envia nada sozinho.</strong> Ele diz quem cobrar hoje e monta a
          mensagem; quem envia é você, pelo canal da etapa. Depois de enviar, registre aqui —
          é o registro que faz a régua andar pra próxima etapa.
        </p>
      </Card>

      {aCobrarHoje.length === 0 ? (
        <Card className="p-8 text-center text-sm text-foreground/55">
          Nenhuma cobrança devida hoje.
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {aCobrarHoje.map(({ conta, devida }) => (
            <CobrancaConta
              key={conta.id}
              companyId={companyId}
              agendamentoId={conta.id}
              descricao={conta.descricao}
              vencimento={conta.vencimento}
              emAberto={valorEmAberto(conta)}
              contatoNome={
                conta.contato_id ? nomePorContato.get(conta.contato_id) ?? null : null
              }
              etapa={devida!.etapa}
              diasAtraso={devida!.diasAtraso}
              texto={devida!.texto}
              notaVinculada={
                conta.dps_id
                  ? (() => {
                      const n = notaPorId.get(conta.dps_id);
                      return n ? `NFS-e ${n.serie}/${n.numero_dps}` : "Nota vinculada";
                    })()
                  : null
              }
              notasDisponiveis={notasDisponiveis.map((n) => ({
                id: n.id,
                rotulo: `${n.serie}/${n.numero_dps} · ${formatarBRL(n.valor)} · ${n.descricao.slice(0, 40)}`,
              }))}
            />
          ))}
        </Card>
      )}

      {emDia.length > 0 && (
        <Card>
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Em aberto, sem cobrança devida hoje{" "}
              <span className="font-normal text-foreground/50">({emDia.length})</span>
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {emDia.map(({ conta }) => (
              <li key={conta.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {conta.descricao || "Sem descrição"}
                    {!conta.dps_id && (
                      <span className="ml-2 text-xs font-normal text-warning">sem NFS-e</span>
                    )}
                  </p>
                  <p className="text-xs text-foreground/50">
                    {conta.contato_id
                      ? nomePorContato.get(conta.contato_id) ?? "—"
                      : "sem contato"}{" "}
                    · vence {formatarDataBr(conta.vencimento)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium text-foreground">
                  {formatarBRL(valorEmAberto(conta))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ReguaCobranca
        companyId={companyId}
        etapas={etapas.map((e) => ({
          id: e.id,
          nome: e.nome,
          diasRelativos: e.diasRelativos,
          canal: e.canal,
          canalLabel: CANAL_LABELS[e.canal],
          template: e.template,
          ativa: e.ativa,
        }))}
      />
    </div>
  );
}
