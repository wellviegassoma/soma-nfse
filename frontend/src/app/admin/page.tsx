import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { competenciasTrimestre, resolverRbt12 } from "@/lib/faturamento";
import { resolverFatorR, resolverFp12, totalFolhaComEncargos } from "@/lib/folha";
import { calcularImpostoResumo, resolverIssMensal } from "@/lib/calculo-impostos";

export const metadata = { title: "Visão geral — Painel SOMA" };

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function diasAteVencer(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

const SIGLA_REGIME: Record<string, string> = {
  SIMPLES_NACIONAL: "SN",
  LUCRO_PRESUMIDO: "LP",
  LUCRO_REAL: "LR",
  IMUNE_ISENTO: "II",
};

type DpsRow = {
  company_id: string;
  valor: number;
  status: string;
  data_competencia: string;
  nfse: { status: string; access_key: string | null } | { status: string; access_key: string | null }[] | null;
};

type AgregadoDistribuidasRow = {
  company_id: string;
  competencia: string;
  faturamento: number;
  faturamento_hospitalar: number;
  notas_count: number;
  notas_canceladas_count: number;
};

type MesAgregado = {
  faturamento: number;
  faturamentoHospitalar: number;
  notasCount: number;
  canceladasCount: number;
};

// notas_distribuidas já passou de 34 mil linhas — trazer tudo pro Next.js
// e somar em JS (como era antes) chegou a travar o painel (statement
// timeout). dashboard_agregado_notas_distribuidas() faz a soma por
// empresa/mês direto no Postgres (menos de mil linhas de volta,
// independente de quantas notas existem). Uma nota emitida pelo próprio
// soma-nfse, uma vez processada pelo Sefin Nacional, também aparece em
// notas_distribuidas quando sincronizada (mesma chave_acesso) — pra não
// contar duas vezes, a RPC recebe a lista de chaves já cobertas por dps e
// as exclui da soma; a contribuição dessas poucas notas (dps é uma tabela
// pequena) é somada aqui em JS.
function extrairChavesDps(dpsRows: DpsRow[]): string[] {
  const chaves: string[] = [];
  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue;
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    if (chaveAcesso) chaves.push(chaveAcesso);
  }
  return chaves;
}

function montarAgregadoPorMes(
  dpsRows: DpsRow[],
  agregadoDistribuidas: AgregadoDistribuidasRow[],
  equiparacaoPorChave: Map<string, boolean>,
): Map<string, Map<string, MesAgregado>> {
  const porEmpresaPorMes = new Map<string, Map<string, MesAgregado>>();

  function obterOuCriar(companyId: string, mes: string): MesAgregado {
    let porMes = porEmpresaPorMes.get(companyId);
    if (!porMes) {
      porMes = new Map();
      porEmpresaPorMes.set(companyId, porMes);
    }
    let agr = porMes.get(mes);
    if (!agr) {
      agr = { faturamento: 0, faturamentoHospitalar: 0, notasCount: 0, canceladasCount: 0 };
      porMes.set(mes, agr);
    }
    return agr;
  }

  for (const row of agregadoDistribuidas) {
    const agr = obterOuCriar(row.company_id, row.competencia);
    agr.faturamento += Number(row.faturamento);
    agr.faturamentoHospitalar += Number(row.faturamento_hospitalar);
    agr.notasCount += Number(row.notas_count);
    agr.canceladasCount += Number(row.notas_canceladas_count);
  }

  for (const nota of dpsRows) {
    if (nota.status !== "ACCEPTED") continue; // rejeitada nunca teve chave_acesso — tratada à parte
    const nfseArr = Array.isArray(nota.nfse) ? nota.nfse : nota.nfse ? [nota.nfse] : [];
    const chaveAcesso = nfseArr[0]?.access_key ?? null;
    const cancelada = nfseArr.some((n) => n.status === "CANCELADA");
    const equiparacaoHospitalar = chaveAcesso ? (equiparacaoPorChave.get(chaveAcesso) ?? false) : false;

    const agr = obterOuCriar(nota.company_id, nota.data_competencia.slice(0, 7));
    const valor = Number(nota.valor);
    if (!cancelada) {
      agr.faturamento += valor;
      if (equiparacaoHospitalar) agr.faturamentoHospitalar += valor;
      agr.notasCount += 1;
    } else {
      agr.canceladasCount += 1;
    }
  }

  return porEmpresaPorMes;
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

  // dps é pequena — continua buscada inteira. notas_distribuidas já
  // passou de 34 mil linhas e trazer tudo pro Next.js (como era antes)
  // chegou a travar o painel (statement timeout) — a soma por
  // empresa/mês agora acontece direto no Postgres (ver
  // dashboard_agregado_notas_distribuidas na migration da fase AM).
  const [
    { data: companies },
    dpsRows,
    { data: folhas },
    { data: receitasManuais },
    { data: certificadosRaw },
  ] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, legal_name, trade_name, person_type, created_at, data_abertura, tax_regime, sujeito_fator_r, irpj_csll_apuracao_mensal, iss_aliquota_padrao, iss_tipo, iss_valor_fixo_profissional, iss_quantidade_profissionais",
        )
        .eq("ativa", true)
        .order("legal_name", { ascending: true }),
      buscarTudoPaginado<DpsRow>((from, to) =>
        supabase
          .from("dps")
          .select("company_id, valor, status, data_competencia, nfse(status, access_key)")
          .range(from, to),
      ),
      supabase.from("folha_mensal").select("company_id, competencia, valor, pro_labore, fgts"),
      supabase.from("receita_mensal_manual").select("company_id, competencia, valor"),
      supabase.from("certificates").select("company_id, expires_at"),
    ]);

  const empresas = companies ?? [];
  const empresasPJ = empresas.filter((e) => e.person_type !== "PF").length;
  const empresasPF = empresas.filter((e) => e.person_type === "PF").length;

  // Uma nota emitida pelo próprio soma-nfse, uma vez processada pelo Sefin
  // Nacional, também aparece em notas_distribuidas (mesma chave_acesso) —
  // excluída da soma da RPC pra não contar duas vezes; sua contribuição
  // (dps é pequena) entra em montarAgregadoPorMes.
  const chavesDps = extrairChavesDps(dpsRows);
  const [{ data: agregadoDistribuidas }, { data: equiparacaoRows }] = await Promise.all([
    supabase.rpc("dashboard_agregado_notas_distribuidas", { p_chaves_excluir: chavesDps }),
    chavesDps.length > 0
      ? supabase.from("notas_distribuidas").select("chave_acesso, equiparacao_hospitalar").in("chave_acesso", chavesDps)
      : Promise.resolve({ data: [] as { chave_acesso: string; equiparacao_hospitalar: boolean }[] }),
  ]);
  const equiparacaoPorChave = new Map<string, boolean>();
  for (const row of equiparacaoRows ?? []) {
    equiparacaoPorChave.set(row.chave_acesso, row.equiparacao_hospitalar);
  }
  const porEmpresaPorMesDetalhado = montarAgregadoPorMes(
    dpsRows,
    (agregadoDistribuidas ?? []) as AgregadoDistribuidasRow[],
    equiparacaoPorChave,
  );

  // Controle de certificado digital — vencidos ou vencendo nos próximos 45
  // dias, pra equipe não deixar passar a renovação (bloqueia emissão de
  // nota assim que vence).
  const DIAS_LIMITE_CERTIFICADO = 45;
  const empresaPorId = new Map(empresas.map((e) => [e.id, e]));
  const certificadosVencendo = (certificadosRaw ?? [])
    .map((c) => ({
      empresa: empresaPorId.get(c.company_id),
      dias: diasAteVencer(c.expires_at),
      expiresAt: c.expires_at,
    }))
    .filter((c): c is typeof c & { empresa: NonNullable<typeof c.empresa> } =>
      Boolean(c.empresa) && c.dias <= DIAS_LIMITE_CERTIFICADO,
    )
    .sort((a, b) => a.dias - b.dias);
  const empresasSemCertificado = empresas.length - (certificadosRaw ?? []).length;

  // Fator R oficial é sobre a "folha de salários, incluídos encargos" —
  // salários + pró-labore + FGTS do mês, não só o bruto.
  const porEmpresaPorMesFolha = new Map<string, Map<string, number>>();
  for (const f of folhas ?? []) {
    const porMes = porEmpresaPorMesFolha.get(f.company_id) ?? new Map<string, number>();
    porMes.set(
      f.competencia,
      totalFolhaComEncargos({
        valor: Number(f.valor),
        proLabore: f.pro_labore != null ? Number(f.pro_labore) : null,
        fgts: f.fgts != null ? Number(f.fgts) : null,
      }),
    );
    porEmpresaPorMesFolha.set(f.company_id, porMes);
  }

  type Agregado = {
    notasCompetencia: number;
    faturamentoCompetencia: number;
    faturamentoHospitalarCompetencia: number;
    notasRejeitadasCompetencia: number;
    notasCanceladasCompetencia: number;
    notasTotal: number;
    faturamentoTotal: number;
  };

  const porEmpresa = new Map<string, Agregado>();
  const vazio = (): Agregado => ({
    notasCompetencia: 0,
    faturamentoCompetencia: 0,
    faturamentoHospitalarCompetencia: 0,
    notasRejeitadasCompetencia: 0,
    notasCanceladasCompetencia: 0,
    notasTotal: 0,
    faturamentoTotal: 0,
  });

  let notasCompetenciaTotal = 0;
  let faturamentoCompetenciaTotal = 0;
  let rejeitadasCompetenciaTotal = 0;
  let canceladasCompetenciaTotal = 0;

  for (const [companyId, porMes] of porEmpresaPorMesDetalhado) {
    const agr = porEmpresa.get(companyId) ?? vazio();
    for (const [mes, dados] of porMes) {
      // notasCount/faturamento já são só-não-cancelada (ver montarAgregadoPorMes).
      agr.notasTotal += dados.notasCount;
      agr.faturamentoTotal += dados.faturamento;
      if (mes === competencia) {
        agr.notasCompetencia += dados.notasCount;
        agr.faturamentoCompetencia += dados.faturamento;
        agr.faturamentoHospitalarCompetencia += dados.faturamentoHospitalar;
        agr.notasCanceladasCompetencia += dados.canceladasCount;
        notasCompetenciaTotal += dados.notasCount;
        faturamentoCompetenciaTotal += dados.faturamento;
        canceladasCompetenciaTotal += dados.canceladasCount;
      }
    }
    porEmpresa.set(companyId, agr);
  }

  // Rejeitada é um conceito exclusivo de dps (nunca gera chave_acesso,
  // então nunca aparece em notas_distribuidas) — mantido à parte.
  for (const nota of dpsRows) {
    if (nota.status !== "REJECTED") continue;
    if (nota.data_competencia.slice(0, 7) !== competencia) continue;
    const agr = porEmpresa.get(nota.company_id) ?? vazio();
    agr.notasRejeitadasCompetencia += 1;
    rejeitadasCompetenciaTotal += 1;
    porEmpresa.set(nota.company_id, agr);
  }

  // Receita por empresa/mês (não cancelada) — base pro RBT12 (Simples) e
  // pro trimestre (Lucro Presumido) de cada empresa na coluna de imposto.
  // Derivados de porEmpresaPorMesDetalhado — só(get(mes) ?? 0) é usado
  // adiante, então não faz diferença criar a entrada do mês mesmo quando
  // o valor hospitalar é zero.
  const porEmpresaPorMes = new Map<string, Map<string, number>>();
  const porEmpresaPorMesHospitalar = new Map<string, Map<string, number>>();
  for (const [companyId, porMes] of porEmpresaPorMesDetalhado) {
    const faturamentoMap = new Map<string, number>();
    const hospitalarMap = new Map<string, number>();
    for (const [mes, dados] of porMes) {
      faturamentoMap.set(mes, dados.faturamento);
      hospitalarMap.set(mes, dados.faturamentoHospitalar);
    }
    porEmpresaPorMes.set(companyId, faturamentoMap);
    porEmpresaPorMesHospitalar.set(companyId, hospitalarMap);
  }
  const porEmpresaPorMesManual = new Map<string, Map<string, number>>();
  for (const r of receitasManuais ?? []) {
    const porMes = porEmpresaPorMesManual.get(r.company_id) ?? new Map<string, number>();
    porMes.set(r.competencia, Number(r.valor));
    porEmpresaPorMesManual.set(r.company_id, porMes);
  }

  const mesesTrimestre = competenciasTrimestre(competencia);
  const ehUltimoMesDoTrimestre = competencia === mesesTrimestre[2];

  const linhas = empresas.map((empresa) => {
    const agr = porEmpresa.get(empresa.id) ?? vazio();
    const porMes = porEmpresaPorMes.get(empresa.id);
    const receitaPorMes = (mes: string) => porMes?.get(mes) ?? 0;
    const porMesHospitalar = porEmpresaPorMesHospitalar.get(empresa.id);
    const receitaHospitalarPorMes = (mes: string) => porMesHospitalar?.get(mes) ?? 0;

    // RBT12 usa faturamento manual quando informado — tem prioridade
    // sobre o real, tanto pra preencher meses sem nota quanto pra
    // corrigir um mês que já tem nota (útil pra competências anteriores
    // a dezembro/2025, quando a distribuição de notas do Sefin Nacional
    // ainda era parcial).
    const porMesManual = porEmpresaPorMesManual.get(empresa.id);
    const mesesComDadosReal = new Set(porMes?.keys() ?? []);
    const mesesManuaisRbt12 = new Set(porMesManual?.keys() ?? []);
    const mesesComDadosRbt12 = new Set([...mesesComDadosReal, ...mesesManuaisRbt12]);
    const receitaPorMesRbt12 = (mes: string) =>
      porMesManual?.has(mes) ? porMesManual.get(mes)! : (porMes?.get(mes) ?? 0);

    const { rbt12 } = resolverRbt12({
      competencia,
      receitaPorMes: receitaPorMesRbt12,
      mesesComDados: mesesComDadosRbt12,
      mesesManuais: mesesManuaisRbt12,
      dataAbertura: empresa.data_abertura,
    });
    let fatorRPercentual: number | null = null;
    if (empresa.sujeito_fator_r) {
      const porMesFolha = porEmpresaPorMesFolha.get(empresa.id);
      const { fp12 } = resolverFp12({
        competencia,
        folhaPorMes: (mes) => porMesFolha?.get(mes),
        mesesComDados: new Set(porMesFolha?.keys() ?? []),
      });
      fatorRPercentual = resolverFatorR(fp12, rbt12);
    }
    const issMensal = resolverIssMensal({
      issTipo: empresa.iss_tipo,
      aliquotaIss: empresa.iss_aliquota_padrao,
      valorFixoProfissional: empresa.iss_valor_fixo_profissional,
      quantidadeProfissionais: empresa.iss_quantidade_profissionais,
      receitaMes: agr.faturamentoCompetencia,
    });
    const imposto = calcularImpostoResumo({
      taxRegime: empresa.tax_regime,
      receitaMes: agr.faturamentoCompetencia,
      rbt12,
      sujeitoFatorR: empresa.sujeito_fator_r,
      fatorRPercentual,
      receitaTrimestre: mesesTrimestre.reduce((acc, m) => acc + receitaPorMes(m), 0),
      ehUltimoMesDoTrimestre,
      apuracaoMensal: empresa.irpj_csll_apuracao_mensal,
      issMensal,
      receitaMesHospitalar: agr.faturamentoHospitalarCompetencia,
      receitaTrimestreHospitalar: mesesTrimestre.reduce((acc, m) => acc + receitaHospitalarPorMes(m), 0),
    });
    return { empresa, agr, imposto, fatorRPercentual };
  });

  const porFaturamento = [...linhas]
    .filter((l) => l.agr.faturamentoCompetencia > 0)
    .sort((a, b) => b.agr.faturamentoCompetencia - a.agr.faturamentoCompetencia)
    .slice(0, 5);

  const porNotas = [...linhas]
    .filter((l) => l.agr.notasCompetencia > 0)
    .sort((a, b) => b.agr.notasCompetencia - a.agr.notasCompetencia)
    .slice(0, 5);

  const porImposto = [...linhas]
    .filter((l) => l.imposto != null && l.imposto.valor > 0)
    .sort((a, b) => b.imposto!.valor - a.imposto!.valor)
    .slice(0, 5);

  const porAliquota = [...linhas]
    .filter((l) => l.imposto != null && l.imposto.aliquotaEfetiva > 0)
    .sort((a, b) => b.imposto!.aliquotaEfetiva - a.imposto!.aliquotaEfetiva)
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
          <div className="mt-1 text-xs text-foreground/50">
            {empresasPJ} CNPJ · {empresasPF} CPF
          </div>
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

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="text-sm font-semibold text-foreground/70">
            Certificado digital — vencidos ou vencendo em até {DIAS_LIMITE_CERTIFICADO} dias
          </div>
          <Link href="/admin/certificados" className="text-xs text-brand underline">
            {empresasSemCertificado} empresa(s) sem certificado — ver todos
          </Link>
        </div>
        {certificadosVencendo.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhum certificado vencido ou vencendo nos próximos {DIAS_LIMITE_CERTIFICADO} dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {certificadosVencendo.map(({ empresa, dias, expiresAt }) => (
              <Link
                key={empresa.id}
                href={`/admin/empresas/${empresa.id}/certificado`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    Vence em {new Date(expiresAt).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    dias < 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  {dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            Top 5 — maior imposto do mês
          </div>
          {porImposto.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              Nenhuma empresa com imposto calculado nessa competência.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {porImposto.map(({ empresa, imposto }, i) => (
                <div key={empresa.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-4 shrink-0 text-xs font-semibold text-foreground/40">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {formatMoney(imposto!.valor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
            Top 5 — maior alíquota
          </div>
          {porAliquota.length === 0 ? (
            <div className="p-6 text-center text-sm text-foreground/50">
              Nenhuma empresa com alíquota calculada nessa competência.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {porAliquota.map(({ empresa, imposto }, i) => (
                <div key={empresa.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-4 shrink-0 text-xs font-semibold text-foreground/40">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground">
                    {formatPercent(imposto!.aliquotaEfetiva)}
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
          <>
            <div className="flex items-center gap-4 border-b border-border px-5 py-2 text-xs font-medium text-foreground/40">
              <div className="min-w-0 flex-1">Empresa</div>
              <div className="w-12 shrink-0 text-right">Regime</div>
              <div className="w-16 shrink-0 text-right">Fator R</div>
              <div className="w-16 shrink-0 text-right">Alíquota</div>
              <div className="w-28 shrink-0 text-right">Imposto do mês</div>
              <div className="w-28 shrink-0 text-right">Faturamento</div>
            </div>
            <div className="divide-y divide-border">
              {linhasOrdenadas.map(({ empresa, agr, imposto, fatorRPercentual }) => (
                <div key={empresa.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {empresa.trade_name || empresa.legal_name}
                    </div>
                    <div className="text-xs text-foreground/50">
                      {agr.notasCompetencia} nota(s) na competência
                    </div>
                  </div>
                  <div className="w-12 shrink-0 text-right text-sm text-foreground/70">
                    {empresa.tax_regime ? SIGLA_REGIME[empresa.tax_regime] : "—"}
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm text-foreground/70">
                    {empresa.tax_regime === "SIMPLES_NACIONAL" && empresa.sujeito_fator_r
                      ? fatorRPercentual != null
                        ? formatPercent(fatorRPercentual)
                        : "—"
                      : "—"}
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm text-foreground/70">
                    {imposto ? formatPercent(imposto.aliquotaEfetiva) : "—"}
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm font-medium text-foreground">
                    {imposto ? formatMoney(imposto.valor) : "—"}
                  </div>
                  <div className="w-28 shrink-0 text-right text-sm font-semibold text-foreground">
                    {formatMoney(agr.faturamentoCompetencia)}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
