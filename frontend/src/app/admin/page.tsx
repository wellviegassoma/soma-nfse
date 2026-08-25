import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";

export const metadata = { title: "Visão geral — Painel SOMA" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

type DpsRow = {
  company_id: string;
  valor: number;
  status: string;
  data_competencia: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

type NotaDistribuidaRow = {
  company_id: string;
  chave_acesso: string | null;
  valor_servico: number | null;
  competencia: string | null;
  cancelada: boolean;
  direcao: string;
};

// Uma nota emitida pelo próprio soma-nfse, uma vez processada pelo
// Sefin Nacional, também aparece em notas_distribuidas quando
// sincronizada (mesma chave_acesso) — sem isso, contaria duas vezes.
type NotaUnificada = {
  companyId: string;
  competencia: string;
  valor: number;
  cancelada: boolean;
  chaveAcesso: string | null;
};

function unificarNotasDeSaida(dpsRows: DpsRow[], distribuidas: NotaDistribuidaRow[]): NotaUnificada[] {
  const vistos = new Set<string>();
  const unificadas: NotaUnificada[] = [];

  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue; // rejeitada nunca teve chave_acesso — tratada à parte
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    const cancelada = nfseArr.some((n) => n.status === "CANCELADA");
    if (chaveAcesso) vistos.add(chaveAcesso);
    unificadas.push({
      companyId: nota.company_id,
      competencia: nota.data_competencia.slice(0, 7),
      valor: Number(nota.valor),
      cancelada,
      chaveAcesso,
    });
  }

  for (const nota of distribuidas) {
    if (nota.direcao !== "saida") continue;
    if (nota.chave_acesso && vistos.has(nota.chave_acesso)) continue; // já contada via dps
    if (nota.chave_acesso) vistos.add(nota.chave_acesso);
    unificadas.push({
      companyId: nota.company_id,
      competencia: (nota.competencia ?? "").slice(0, 7),
      valor: Number(nota.valor_servico ?? 0),
      cancelada: nota.cancelada,
      chaveAcesso: nota.chave_acesso,
    });
  }

  return unificadas;
}

const COMPETENCIA_REGEX = /^\d{4}-\d{2}$/;

export default async function AdminDashboardPage(props: PageProps<"/admin">) {
  const searchParams = await props.searchParams;
  const empresaSelecionadaId =
    typeof searchParams.empresa === "string" ? searchParams.empresa : undefined;
  const competenciaParam =
    typeof searchParams.competencia === "string" ? searchParams.competencia : undefined;
  const competencia =
    competenciaParam && COMPETENCIA_REGEX.test(competenciaParam)
      ? competenciaParam
      : mesCorrenteBrasilia();

  const supabase = await createClient();

  // Escala atual do produto é pequena (poucas empresas/notas) — busca
  // tudo e agrega em JS. Se crescer muito, trocar por uma agregação SQL
  // (RPC) em vez de trazer toda a tabela `dps` pro servidor Next.js.
  const [{ data: companies }, { data: notas }, { data: distribuidas }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, created_at")
      .order("legal_name", { ascending: true }),
    supabase
      .from("dps")
      .select("company_id, valor, status, data_competencia, nfse(status, access_key)")
      .order("data_competencia", { ascending: false }),
    supabase
      .from("notas_distribuidas")
      .select("company_id, chave_acesso, valor_servico, competencia, cancelada, direcao")
      .eq("direcao", "saida"),
  ]);

  const empresas = companies ?? [];
  const todasNotas = (notas ?? []) as unknown as DpsRow[];
  const todasDistribuidas = (distribuidas ?? []) as NotaDistribuidaRow[];
  const notasUnificadas = unificarNotasDeSaida(todasNotas, todasDistribuidas);

  type Agregado = {
    notasCompetencia: number;
    faturamentoCompetencia: number;
    notasRejeitadasCompetencia: number;
    notasCanceladasCompetencia: number;
    notasTotal: number;
    faturamentoTotal: number;
  };

  const porEmpresa = new Map<string, Agregado>();
  const vazio = (): Agregado => ({
    notasCompetencia: 0,
    faturamentoCompetencia: 0,
    notasRejeitadasCompetencia: 0,
    notasCanceladasCompetencia: 0,
    notasTotal: 0,
    faturamentoTotal: 0,
  });

  let notasCompetenciaTotal = 0;
  let faturamentoCompetenciaTotal = 0;
  let rejeitadasCompetenciaTotal = 0;
  let canceladasCompetenciaTotal = 0;

  for (const nota of notasUnificadas) {
    const agr = porEmpresa.get(nota.companyId) ?? vazio();
    const naCompetencia = nota.competencia === competencia;

    if (!nota.cancelada) {
      agr.notasTotal += 1;
      agr.faturamentoTotal += nota.valor;
    }
    if (naCompetencia) {
      if (!nota.cancelada) {
        agr.notasCompetencia += 1;
        agr.faturamentoCompetencia += nota.valor;
        notasCompetenciaTotal += 1;
        faturamentoCompetenciaTotal += nota.valor;
      } else {
        agr.notasCanceladasCompetencia += 1;
        canceladasCompetenciaTotal += 1;
      }
    }
    porEmpresa.set(nota.companyId, agr);
  }

  // Rejeitada é um conceito exclusivo de dps (nunca gera chave_acesso,
  // então nunca aparece em notas_distribuidas) — mantido à parte.
  for (const nota of todasNotas) {
    if (nota.status !== "REJECTED") continue;
    if (nota.data_competencia.slice(0, 7) !== competencia) continue;
    const agr = porEmpresa.get(nota.company_id) ?? vazio();
    agr.notasRejeitadasCompetencia += 1;
    rejeitadasCompetenciaTotal += 1;
    porEmpresa.set(nota.company_id, agr);
  }

  const linhas = empresas.map((empresa) => ({
    empresa,
    agr: porEmpresa.get(empresa.id) ?? vazio(),
  }));

  const porFaturamento = [...linhas]
    .filter((l) => l.agr.faturamentoCompetencia > 0)
    .sort((a, b) => b.agr.faturamentoCompetencia - a.agr.faturamentoCompetencia)
    .slice(0, 5);

  const porNotas = [...linhas]
    .filter((l) => l.agr.notasCompetencia > 0)
    .sort((a, b) => b.agr.notasCompetencia - a.agr.notasCompetencia)
    .slice(0, 5);

  const linhasOrdenadas = [...linhas].sort(
    (a, b) => b.agr.faturamentoCompetencia - a.agr.faturamentoCompetencia,
  );

  const empresaSelecionada = empresaSelecionadaId
    ? linhas.find((l) => l.empresa.id === empresaSelecionadaId)
    : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Visão geral</h1>
        <p className="text-sm text-foreground/60">
          Indicadores da competência {formatCompetencia(competencia)}, todas as empresas.
        </p>
      </div>

      <Card className="p-6">
        <form className="flex flex-wrap items-end gap-3">
          <div className="w-[160px]">
            <Field label="Competência" htmlFor="competencia">
              <Input id="competencia" name="competencia" type="month" defaultValue={competencia} />
            </Field>
          </div>
          <div className="min-w-[240px] flex-1">
            <Field label="Analisar empresa" htmlFor="empresa">
              <Select id="empresa" name="empresa" defaultValue={empresaSelecionadaId ?? ""}>
                <option value="">Todas as empresas</option>
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.trade_name || empresa.legal_name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit">Aplicar</Button>
        </form>

        {empresaSelecionada && (
          <div className="mt-5 border-t border-border pt-5">
            <div className="mb-3 text-sm font-semibold text-foreground">
              {empresaSelecionada.empresa.trade_name || empresaSelecionada.empresa.legal_name}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <div className="text-xs text-foreground/50">
                  Notas emitidas ({formatCompetencia(competencia)})
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {empresaSelecionada.agr.notasCompetencia}
                </div>
              </div>
              <div>
                <div className="text-xs text-foreground/50">
                  Faturamento ({formatCompetencia(competencia)})
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {formatMoney(empresaSelecionada.agr.faturamentoCompetencia)}
                </div>
              </div>
              <div>
                <div className="text-xs text-foreground/50">Notas emitidas (total)</div>
                <div className="text-lg font-semibold text-foreground">
                  {empresaSelecionada.agr.notasTotal}
                </div>
              </div>
              <div>
                <div className="text-xs text-foreground/50">Faturamento (total)</div>
                <div className="text-lg font-semibold text-foreground">
                  {formatMoney(empresaSelecionada.agr.faturamentoTotal)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Empresas cadastradas</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">{empresas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Notas emitidas</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {notasCompetenciaTotal}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Faturamento</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {formatMoney(faturamentoCompetenciaTotal)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Rejeitadas / canceladas</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {rejeitadasCompetenciaTotal} / {canceladasCompetenciaTotal}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            Top 5 — maior faturamento
          </div>
          {porFaturamento.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              Nenhum faturamento nessa competência.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {porFaturamento.map(({ empresa, agr }, i) => (
                <div key={empresa.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-4 shrink-0 text-xs font-semibold text-foreground/40">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {formatMoney(agr.faturamentoCompetencia)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            Top 5 — mais notas emitidas
          </div>
          {porNotas.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              Nenhuma nota emitida nessa competência.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {porNotas.map(({ empresa, agr }, i) => (
                <div key={empresa.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-4 shrink-0 text-xs font-semibold text-foreground/40">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {agr.notasCompetencia}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Faturamento por empresa — {formatCompetencia(competencia)}
        </div>
        {linhasOrdenadas.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">
            Nenhuma empresa cadastrada ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {linhasOrdenadas.map(({ empresa, agr }) => (
              <div key={empresa.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {agr.notasCompetencia} nota(s) na competência
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-foreground">
                  {formatMoney(agr.faturamentoCompetencia)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
