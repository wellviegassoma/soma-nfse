import "server-only";

// Newton — analista fiscal de IA do Lucro Presumido (Petrópolis e Rio).
// Mesmo desenho da Serena (lib/serena.ts): monta o retrato do mês de cada
// empresa a partir das tabelas existentes (notas, conferência com a
// prefeitura, cálculo do Presumido, MIT/DCTFWeb, DARF, entrega, pagamento).
// Nada aqui transmite ou paga — só monta o retrato.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buscarFaturamentoMensalLote,
  competenciasTrimestre,
  somarFaturamento,
  somarFaturamentoIssRetido,
  somarFaturamentoPorEquiparacao,
  somarRetencoes,
} from "@/lib/faturamento";
import { calcularLucroPresumido, resolverIssMensal, valoresDevidosNoPeriodoMit } from "@/lib/calculo-impostos";
import { IBGE_PETROPOLIS, IBGE_RIO, somarMeses } from "@/lib/tarefas-comum";
import { filiaisPorMatriz, ordemCnpj, raizCnpj, type EstadoEtapa, type Etapa, type FilialSimples, type MotivoAceito } from "@/lib/serena";
import { chaveDescricao, NATUREZAS_SEM_EQUIPARACAO, regraEquiparacao, type SugestaoEquiparacao } from "@/lib/equiparacao";

type Db = SupabaseClient;

export const NEWTON_MUNICIPIOS = [IBGE_PETROPOLIS, IBGE_RIO];

export type EmpresaNewton = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  cnpj: string | null;
  municipality_ibge_code: string | null;
  irpj_csll_apuracao_mensal: boolean;
  equiparacao_hospitalar: boolean;
  iss_tipo: string | null;
  iss_aliquota_padrao: number | null;
  iss_valor_fixo_profissional: number | null;
  iss_quantidade_profissionais: number | null;
  ultima_sincronizacao_status: string | null;
  ultima_sincronizacao_erro: string | null;
};
const COLUNAS =
  "id, legal_name, trade_name, codigo_cliente, cnpj, municipality_ibge_code, irpj_csll_apuracao_mensal, equiparacao_hospitalar, iss_tipo, iss_aliquota_padrao, iss_valor_fixo_profissional, iss_quantidade_profissionais, ultima_sincronizacao_status, ultima_sincronizacao_erro";

export type NewtonFechamento = {
  ia_decisao: "APROVAR" | "ESCALAR" | null;
  ia_justificativa: string | null;
  ia_pergunta: string | null;
  ia_diagnostico: string | null;
  ia_acoes: { acao: string; onde: string }[] | null;
  ia_assinatura: string | null;
  ia_em: string | null;
  escalado_para: string | null;
  tarefa_id: string | null;
  aprovado_assinatura: string | null;
  aprovado_em: string | null;
  dctfweb_transmitida_em: string | null;
  darf_blob_pathname: string | null;
  darf_valor: number | null;
  darf_gerado_em: string | null;
  entregue_em: string | null;
  mensagem_guia_em: string | null;
  mensagem_cobranca_em: string | null;
  pago: boolean | null;
  pagamento_verificado_em: string | null;
  motivos_aceitos: MotivoAceito[] | null;
};

export type Motivo = { nivel: "BLOQUEADO" | "REVISAR"; codigo: string; texto: string };

/** Última conferência das Centrais ISS (Rio: Nota Carioca; Petrópolis: guia do ISS). */
export type ConferenciaCentralIss = { status: string; mensagem: string | null; conferidoEm: string };

const ROTULO_CENTRAL: Record<string, string> = {
  ok: "Bate",
  falta_emitir: "Bate — falta emitir",
  diferenca: "Diferença",
  sem_movimento: "Sem movimento",
  sem_guia: "Sem guia na prefeitura",
  cadastro: "Conferir cadastro",
  erro: "Erro",
  paga: "Guia paga",
};
// "paga": a guia do mês está paga na Central e o valor bate com o ISS da SOMA
// (vale mesmo quando a consulta não acha mais a guia — já quitada, ou emitida
// por fora do sistema).
const CENTRAL_OK = new Set(["ok", "falta_emitir", "sem_movimento", "paga"]);

/**
 * Petrópolis tem duas conferências: a de faturamento (conferencia_prefeitura)
 * e a da Central ISS Petrópolis (iss_conferencias). Central que bate vale
 * sempre (ex.: login da consulta de faturamento falhou); senão vale a de
 * faturamento quando confere; sobrando, a Central mostra o problema.
 */
function usarCentralPetropolis(
  prefeitura: { valor: number | null; erro: string | null } | null,
  central: ConferenciaCentralIss | null,
  receitaMes: number,
): boolean {
  if (!central) return false;
  if (CENTRAL_OK.has(central.status)) return true;
  const faturamentoConfere = !!prefeitura && !prefeitura.erro && Math.abs((prefeitura.valor ?? 0) - receitaMes) <= 1;
  return !faturamentoConfere;
}

export type CalculoNewton = {
  receitaMes: number;
  receitaTrimestre: number;
  receitaHospitalarTrimestre: number;
  receitaHospitalarMes: number;
  fechaTrimestre: boolean; // mês em que IRPJ/CSLL vencem (3º mês do trimestre ou apuração mensal)
  retencaoMes: { irrf: number; contribuicoesSociais: number };
  retencaoTrimestre: { irrf: number; contribuicoesSociais: number };
  bruto: { irpj: number; irpjAdicional: number; csll: number; pis: number; cofins: number };
  devido: { irpj: number; csll: number; pis: number; cofins: number };
  total: number;
  mediaReceita3m: number | null;
};

export type NotaEquiparacao = {
  id: string;
  numero: string | null;
  competencia: string; // AAAA-MM
  descricao: string;
  tomador: string | null;
  valor: number;
  marcada: boolean;
  sugestao: SugestaoEquiparacao;
  origem: "APRENDIDA" | "REGRA" | "PADRAO_EMPRESA";
  motivo: string;
};

/** Equiparação hospitalar da empresa no trimestre da competência. */
export type EquiparacaoNewton = {
  natureza: string | null;
  naturezaImpede: string | null; // ex.: "Sociedade Simples Limitada"
  duvidaPadrao: boolean | null;
  notas: NotaEquiparacao[];
  pendentes: number; // marcada ≠ sugestão, ou dúvida sem decisão
};

export type LinhaNewton = {
  id: string;
  nome: string;
  municipio: "Petrópolis" | "Rio de Janeiro" | "Outro";
  issFixo: boolean; // sociedade uniprofissional (ISS por profissional)
  equiparacaoCadastro: boolean;
  calc: CalculoNewton;
  filiais: FilialSimples[];
  equiparacao: EquiparacaoNewton | null;
  conferencia: "OK" | "REVISAR" | "BLOQUEADO";
  motivos: Motivo[];
  motivosAceitos: (Motivo & { justificativa: string | null })[];
  assinatura: string;
  aprovada: boolean;
  mitEncerrado: boolean;
  newton: NewtonFechamento | null;
  temGrupoDigisac: boolean;
  etapas: Etapa[];
  situacao: "acao" | "newton" | "concluida";
  recado: string;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function nomeEmpresaNewton(e: { codigo_cliente: string | null; trade_name: string | null; legal_name: string }) {
  const nome = e.trade_name || e.legal_name;
  return e.codigo_cliente ? `${e.codigo_cliente} · ${nome}` : nome;
}

/** Carteira: Lucro Presumido ativas de Petrópolis/Rio ± exceções; filial entra na matriz. */
export async function carteiraNewton(db: Db): Promise<EmpresaNewton[]> {
  const [{ data: base, error }, { data: excecoes }] = await Promise.all([
    db
      .from("companies")
      .select(COLUNAS)
      .eq("tax_regime", "LUCRO_PRESUMIDO")
      .eq("ativa", true)
      .not("cnpj", "is", null)
      .in("municipality_ibge_code", NEWTON_MUNICIPIOS)
      .order("legal_name"),
    db.from("newton_excecoes").select("company_id, tipo"),
  ]);
  if (error) throw new Error(error.message);
  const excluir = new Set((excecoes ?? []).filter((x) => x.tipo === "EXCLUIR").map((x) => x.company_id as string));
  const incluir = (excecoes ?? []).filter((x) => x.tipo === "INCLUIR").map((x) => x.company_id as string);
  const lista = ((base ?? []) as EmpresaNewton[]).filter((e) => !excluir.has(e.id));
  const ja = new Set(lista.map((e) => e.id));
  const faltam = incluir.filter((id) => !ja.has(id));
  if (faltam.length) {
    const { data: extras } = await db.from("companies").select(COLUNAS).in("id", faltam);
    lista.push(...((extras ?? []) as EmpresaNewton[]));
  }
  // MIT e DCTFWeb são por raiz de CNPJ: filial soma na matriz. Filial cuja
  // matriz é de outra cidade (ex.: 223 Rio, matriz 222 em São Paulo) sai da
  // carteira — quem declara é a matriz.
  const { data: matrizesLp } = await db
    .from("companies")
    .select("cnpj")
    .eq("tax_regime", "LUCRO_PRESUMIDO")
    .eq("ativa", true)
    .not("cnpj", "is", null);
  const raizesComMatriz = new Set(((matrizesLp ?? []) as { cnpj: string | null }[]).filter((e) => ordemCnpj(e) === "0001").map((e) => raizCnpj(e)));
  return lista.filter((e) => ordemCnpj(e) === "0001" || !raizesComMatriz.has(raizCnpj(e)));
}

type Fat = Awaited<ReturnType<typeof buscarFaturamentoMensalLote>> extends Map<string, infer V> ? V : never;

/** Notas e retenções da empresa toda (matriz + filiais). */
export function somarFiliais(matriz: Fat | undefined, filiais: (Fat | undefined)[]): Fat {
  const todas = [matriz, ...filiais].filter((x): x is Fat => x != null);
  return { notas: todas.flatMap((x) => x.notas), retencoes: todas.flatMap((x) => x.retencoes) } as Fat;
}

/** Cálculo do mês pelo motor do Presumido (mesmo da Central MIT e da declaração do MIT). */
export function calcularNewton(e: Pick<EmpresaNewton, "irpj_csll_apuracao_mensal">, competencia: string, fat: Fat): CalculoNewton {
  const { notas, retencoes } = fat;
  const meses = competenciasTrimestre(competencia);
  const fechaTrimestre = e.irpj_csll_apuracao_mensal || competencia === meses[2];
  const m = somarFaturamentoPorEquiparacao(notas, [competencia]);
  const t = somarFaturamentoPorEquiparacao(notas, meses);
  const r = calcularLucroPresumido({
    receitaMesGeral: m.geral,
    receitaMesHospitalar: m.hospitalar,
    receitaTrimestreGeral: t.geral,
    receitaTrimestreHospitalar: t.hospitalar,
    ehUltimoMesDoTrimestre: competencia === meses[2],
    apuracaoMensal: e.irpj_csll_apuracao_mensal,
    issMensal: null,
  });
  const retencaoMes = somarRetencoes(retencoes, [competencia]);
  const retencaoTrimestre = somarRetencoes(retencoes, meses);
  const devido = valoresDevidosNoPeriodoMit(r, retencaoMes, retencaoTrimestre);
  const ant = [1, 2, 3].map((k) => somarFaturamento(notas, [somarMeses(competencia, -k)]));
  const comReceita = ant.filter((v) => v > 0);
  return {
    receitaMes: somarFaturamento(notas, [competencia]),
    receitaTrimestre: t.geral + t.hospitalar,
    receitaHospitalarTrimestre: t.hospitalar,
    receitaHospitalarMes: m.hospitalar,
    fechaTrimestre,
    retencaoMes,
    retencaoTrimestre,
    bruto: { irpj: r.irpj, irpjAdicional: r.irpjAdicional, csll: r.csll, pis: r.pis, cofins: r.cofins },
    devido,
    total: devido.irpj + devido.csll + devido.pis + devido.cofins,
    mediaReceita3m: comReceita.length ? comReceita.reduce((a, b) => a + b, 0) / comReceita.length : null,
  };
}

/** Conferência determinística do Newton (a IA só olha o que cair em REVISAR). */
export function conferirNewton(p: {
  e: EmpresaNewton;
  calc: CalculoNewton;
  competencia: string;
  prefeitura: { valor: number | null; erro: string | null } | null;
  filiais: FilialSimples[];
  equiparacao: EquiparacaoNewton | null;
  central?: ConferenciaCentralIss | null;
}): Motivo[] {
  const { e, calc } = p;
  const motivos: Motivo[] = [];
  const bloquear = (codigo: string, texto: string) => motivos.push({ nivel: "BLOQUEADO", codigo, texto });
  const revisar = (codigo: string, texto: string) => motivos.push({ nivel: "REVISAR", codigo, texto });

  if (p.e.ultima_sincronizacao_status === "erro") revisar("NOTAS_ERRO", "A última busca de notas deu erro — refazer antes de fechar.");
  if (calc.receitaMes <= 0) revisar("SEM_RECEITA", "Nenhuma receita na competência — confirmar se é sem movimento ou se faltou buscar notas.");

  // Equiparação hospitalar nota a nota (lib/equiparacao.ts + decisões
  // aprendidas). Sociedade simples não pode usar; nota com marcação diferente
  // da sugestão, ou dúvida sem decisão, fica pendente — bloqueia no mês do
  // IRPJ/CSLL (prova de out/2026: a equipe declarava 8%/12% de cabeça).
  const eq = p.equiparacao;
  if (e.equiparacao_hospitalar && eq) {
    if (eq.naturezaImpede) {
      revisar("EQUIPARACAO_NATUREZA", `Empresa marcada para equiparação hospitalar, mas é ${eq.naturezaImpede} — a lei exige sociedade empresária. Confirmar com o contador antes de usar 8%/12%.`);
    } else if (eq.pendentes > 0) {
      const texto = `Equiparação hospitalar: ${eq.pendentes} nota(s) do trimestre para confirmar (sugestão do Newton pronta em "Equiparação").`;
      if (calc.fechaTrimestre) bloquear("EQUIPARACAO_PENDENTE", texto);
      else revisar("EQUIPARACAO_PENDENTE", texto);
    }
  } else if (!e.equiparacao_hospitalar && calc.receitaHospitalarTrimestre > 0) {
    revisar("EQUIPARACAO_SEM_CADASTRO", "Há nota marcada como hospitalar, mas a empresa não está cadastrada para equiparação.");
  }

  if (calc.mediaReceita3m && calc.receitaMes > 0) {
    const r = calc.receitaMes / calc.mediaReceita3m;
    if (r < 0.4) revisar("VARIACAO_BAIXA", `Receita do mês (${brl(calc.receitaMes)}) é ${Math.round(r * 100)}% da média dos 3 meses anteriores — conferir se faltam notas.`);
    if (r > 2.5) revisar("VARIACAO_ALTA", `Receita do mês (${brl(calc.receitaMes)}) é ${r.toFixed(1)}× a média dos 3 meses anteriores — conferir nota duplicada ou de outra competência.`);
  }

  const central = p.central ?? null;
  if (e.municipality_ibge_code === IBGE_RIO) {
    // Rio: a conferência é a da Central ISS Rio (faturamento SOMA × guia do Nota Carioca).
    if (!central) revisar("PREFEITURA_NAO_CONFERIDA", "ISS do Rio ainda não conferido na Central ISS Rio (faturamento × Nota Carioca).");
    else if (!CENTRAL_OK.has(central.status))
      revisar("PREFEITURA_DIVERGE", `Central ISS Rio: ${ROTULO_CENTRAL[central.status] ?? central.status}${central.mensagem ? ` — ${central.mensagem.slice(0, 120)}` : ""}.`);
  } else if (e.municipality_ibge_code === IBGE_PETROPOLIS && central && usarCentralPetropolis(p.prefeitura, central, calc.receitaMes)) {
    // Petrópolis: a Central ISS Petrópolis (guia do ISS) vale quando bate, ou
    // quando a conferência de faturamento não existe / deu erro / diverge.
    if (!CENTRAL_OK.has(central.status))
      revisar("PREFEITURA_DIVERGE", `Central ISS Petrópolis: ${ROTULO_CENTRAL[central.status] ?? central.status}${central.mensagem ? ` — ${central.mensagem.slice(0, 120)}` : ""}.`);
  } else if (e.municipality_ibge_code === IBGE_PETROPOLIS) {
    if (!p.prefeitura) revisar("PREFEITURA_NAO_CONFERIDA", "Faturamento ainda não conferido com a Prefeitura de Petrópolis.");
    else if (p.prefeitura.erro) revisar("PREFEITURA_ERRO", `Consulta à prefeitura deu erro: ${p.prefeitura.erro.slice(0, 80)}`);
    else if (Math.abs((p.prefeitura.valor ?? 0) - calc.receitaMes) > 1)
      revisar("PREFEITURA_DIVERGE", `Prefeitura ${brl(p.prefeitura.valor ?? 0)} × notas ${brl(calc.receitaMes)}.`);
  }

  // Retenção maior que o tributo: sobra crédito — o MIT zera, mas o saldo
  // precisa de PER/DCOMP ou compensação; a equipe decide.
  const pisRet = calc.retencaoMes.contribuicoesSociais * (0.0065 / 0.0465);
  const cofinsRet = calc.retencaoMes.contribuicoesSociais * (0.03 / 0.0465);
  if (pisRet > calc.bruto.pis + 0.01 || cofinsRet > calc.bruto.cofins + 0.01)
    revisar("RETENCAO_MAIOR", "Retenção de PIS/COFINS maior que o devido no mês — sobra crédito para compensar.");
  if (calc.fechaTrimestre && calc.retencaoTrimestre.irrf > calc.bruto.irpj + 0.01)
    revisar("RETENCAO_MAIOR_IRPJ", "IRRF retido maior que o IRPJ do período — sobra crédito para compensar.");

  return motivos;
}

function assinaturaNewton(calc: CalculoNewton, motivos: Motivo[]) {
  const n = (v: number) => v.toFixed(2);
  return [
    n(calc.receitaMes),
    n(calc.receitaTrimestre),
    n(calc.receitaHospitalarTrimestre),
    n(calc.devido.irpj),
    n(calc.devido.csll),
    n(calc.devido.pis),
    n(calc.devido.cofins),
    motivos.map((m) => m.codigo).sort().join("."),
  ].join("|");
}

/** Monta a esteira de todas as empresas da carteira na competência. */
export async function carregarEsteiraNewton(db: Db, competencia: string): Promise<LinhaNewton[]> {
  const empresas = await carteiraNewton(db);
  const ids = empresas.map((e) => e.id);
  if (!ids.length) return [];
  const filiais = await filiaisPorMatriz(db, empresas, "LUCRO_PRESUMIDO");
  const idsFiliais = [...filiais.values()].flat().map((f) => f.id);
  const comEquiparacao = empresas.filter((e) => e.equiparacao_hospitalar);
  const idsEquip = [...comEquiparacao.map((e) => e.id), ...comEquiparacao.flatMap((e) => (filiais.get(e.id) ?? []).map((f) => f.id))];
  const mesesTri = competenciasTrimestre(competencia);
  const [{ data: notasEq }, { data: decisoes }, { data: configEq }] = idsEquip.length
    ? await Promise.all([
        db
          .from("notas_distribuidas")
          .select("id, company_id, numero, competencia, descricao_servico, tomador_nome, valor_servico, equiparacao_hospitalar")
          .in("company_id", idsEquip)
          .eq("direcao", "saida")
          .eq("cancelada", false)
          .gte("competencia", `${mesesTri[0]}-01`)
          .lt("competencia", `${somarMeses(competencia, 1)}-01`) // até o mês que está sendo fechado (não traz mês futuro)
          .order("competencia"),
        db.from("newton_equiparacao_decisoes").select("company_id, chave, hospitalar").in("company_id", comEquiparacao.map((e) => e.id)),
        db.from("newton_equiparacao_empresa").select("company_id, duvida_padrao, natureza_juridica").in("company_id", comEquiparacao.map((e) => e.id)),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const equiparacaoDe = (e: EmpresaNewton): EquiparacaoNewton | null => {
    if (!e.equiparacao_hospitalar) return null;
    const ids = new Set([e.id, ...(filiais.get(e.id) ?? []).map((f) => f.id)]);
    const cfg = (configEq ?? []).find((c) => c.company_id === e.id);
    const aprendidas = new Map((decisoes ?? []).filter((d) => d.company_id === e.id).map((d) => [d.chave as string, d.hospitalar as boolean]));
    const duvidaPadrao = (cfg?.duvida_padrao as boolean | null | undefined) ?? null;
    const notas: NotaEquiparacao[] = (notasEq ?? [])
      .filter((n) => ids.has(n.company_id as string))
      .map((n) => {
        const descricao = (n.descricao_servico as string | null) ?? "";
        const aprendida = aprendidas.get(chaveDescricao(descricao));
        const regra = regraEquiparacao(descricao);
        const [sugestao, origem, motivo]: [SugestaoEquiparacao, NotaEquiparacao["origem"], string] =
          aprendida != null
            ? [aprendida ? "SIM" : "NAO", "APRENDIDA", "decisão anterior da equipe para essa descrição"]
            : regra.sugestao !== "DUVIDA"
              ? [regra.sugestao, "REGRA", regra.motivo]
              : duvidaPadrao != null
                ? [duvidaPadrao ? "SIM" : "NAO", "PADRAO_EMPRESA", "padrão da empresa para descrição genérica"]
                : ["DUVIDA", "REGRA", regra.motivo];
        return {
          id: n.id as string,
          numero: (n.numero as string | null) ?? null,
          competencia: String(n.competencia).slice(0, 7),
          descricao: descricao.replace(/\s+/g, " ").slice(0, 200),
          tomador: (n.tomador_nome as string | null) ?? null,
          valor: Number(n.valor_servico ?? 0),
          marcada: n.equiparacao_hospitalar === true,
          sugestao,
          origem,
          motivo,
        };
      });
    const pendentes = notas.filter((n) => n.sugestao === "DUVIDA" || (n.sugestao === "SIM") !== n.marcada).length;
    const natureza = (cfg?.natureza_juridica as string | null | undefined) ?? null;
    return { natureza, naturezaImpede: natureza ? (NATUREZAS_SEM_EQUIPARACAO[natureza] ?? null) : null, duvidaPadrao, notas, pendentes };
  };

  const [fat, { data: pref }, { data: mits }, { data: fechamentos }, { data: vinculos }] = await Promise.all([
    buscarFaturamentoMensalLote(db, [...ids, ...idsFiliais]),
    db.from("conferencia_prefeitura").select("company_id, valor_prefeitura, erro").eq("competencia", competencia).in("company_id", ids),
    db.from("integra_contador_mit_encerramentos").select("company_id, situacao_apuracao, created_at").eq("competencia", competencia).in("company_id", ids),
    db.from("newton_fechamentos").select("*").eq("competencia", competencia).in("company_id", ids),
    db.from("pedido_nota_vinculos").select("company_id").in("company_id", ids),
  ]);
  const [{ data: centrais }, { data: pagamentosIss }] = await Promise.all([
    db.from("iss_conferencias").select("company_id, municipio, status, mensagem, conferido_em").eq("competencia", competencia).in("company_id", ids),
    db.from("iss_pagamentos").select("company_id, status, dados, verificado_em").eq("competencia", competencia).in("company_id", ids),
  ]);
  const pagoPor = new Map(
    (pagamentosIss ?? [])
      .filter((p) => p.status === "paga")
      .map((p) => {
        const pagas = (((p.dados as { pagas?: { valor: number | null; pago_em?: string | null; quitada_em?: string | null }[] } | null)?.pagas) ?? []);
        return [p.company_id as string, { valor: pagas.reduce((t, g) => t + Number(g.valor ?? 0), 0), em: pagas[0]?.pago_em ?? pagas[0]?.quitada_em ?? null, verificadoEm: p.verificado_em as string }];
      }),
  );
  const centralPor = new Map(
    (centrais ?? []).map((c) => [c.company_id as string, { status: c.status as string, mensagem: (c.mensagem as string | null) ?? null, conferidoEm: c.conferido_em as string }]),
  );
  const prefPor = new Map((pref ?? []).map((p) => [p.company_id as string, { valor: p.valor_prefeitura == null ? null : Number(p.valor_prefeitura), erro: (p.erro as string | null) ?? null }]));
  const mitPor = new Set((mits ?? []).filter((m) => m.situacao_apuracao !== "ERRO").map((m) => m.company_id as string));
  const newtonPor = new Map((fechamentos ?? []).map((f) => [f.company_id as string, f as unknown as NewtonFechamento]));
  const comGrupo = new Set((vinculos ?? []).map((v) => v.company_id as string));

  const linhas = empresas.map((e) => {
    const minhas = filiais.get(e.id) ?? [];
    const dados = somarFiliais(fat.get(e.id), minhas.map((f) => fat.get(f.id)));
    const calc = calcularNewton(e, competencia, dados);
    const prefeitura = prefPor.get(e.id) ?? null;
    const equiparacao = equiparacaoDe(e);
    const newton = newtonPor.get(e.id) ?? null;
    // "Aceitar e seguir": motivo aceito pela equipe sai da conferência.
    const aceitos = new Map((newton?.motivos_aceitos ?? []).map((a) => [a.codigo, a]));
    // Guia do ISS paga com valor que bate com o ISS da SOMA (mesma conta da
    // Central: percentual ou fixo por profissional, menos o retido; tolera
    // juros/multa de até 20%) = conferido, mesmo que a consulta da prefeitura
    // não ache mais a guia (ex.: Chrisorto 10/2026, "sem guia" mas paga).
    const issSoma = resolverIssMensal({
      issTipo: e.iss_tipo as never,
      aliquotaIss: e.iss_aliquota_padrao == null ? null : Number(e.iss_aliquota_padrao),
      valorFixoProfissional: e.iss_valor_fixo_profissional == null ? null : Number(e.iss_valor_fixo_profissional),
      quantidadeProfissionais: e.iss_quantidade_profissionais == null ? null : Number(e.iss_quantidade_profissionais),
      receitaMes: calc.receitaMes,
      receitaIssRetido: somarFaturamentoIssRetido(dados.notas, [competencia]),
    });
    const pago = pagoPor.get(e.id);
    const pagoBate = !!pago && pago.valor > 0 && (issSoma == null || (pago.valor >= issSoma - 1 && pago.valor <= issSoma * 1.2 + 1));
    const centralBruta = centralPor.get(e.id) ?? null;
    const central =
      pagoBate && (!centralBruta || !CENTRAL_OK.has(centralBruta.status))
        ? {
            status: "paga",
            mensagem: `paga ${brl(pago!.valor)}${pago!.em ? ` em ${String(pago!.em).slice(0, 10).split("-").reverse().join("/")}` : ""}${issSoma != null ? ` (ISS SOMA ${brl(issSoma)})` : ""}`,
            conferidoEm: pago!.verificadoEm,
          }
        : centralBruta;
    const todos = conferirNewton({ e, calc, competencia, prefeitura, filiais: minhas, equiparacao, central });
    const motivos = todos.filter((m) => !aceitos.has(m.codigo));
    const motivosAceitos = todos.filter((m) => aceitos.has(m.codigo)).map((m) => ({ ...m, justificativa: aceitos.get(m.codigo)?.justificativa ?? null }));
    const conferencia = motivos.some((m) => m.nivel === "BLOQUEADO") ? "BLOQUEADO" : motivos.length ? "REVISAR" : "OK";
    const assinatura = assinaturaNewton(calc, motivos);
    const aprovada = conferencia === "OK" || (conferencia === "REVISAR" && newton?.aprovado_assinatura === assinatura);
    return montarLinha({
      e,
      calc,
      filiais: minhas,
      equiparacao,
      prefeitura,
      central,
      conferencia,
      motivos,
      motivosAceitos,
      assinatura,
      aprovada,
      mitEncerrado: mitPor.has(e.id),
      newton,
      temGrupo: comGrupo.has(e.id),
    });
  });
  return linhas.sort(porCodigo);
}

/** Ordem da tela: pelo código do cliente (número da pasta). */
function porCodigo(a: { nome: string }, b: { nome: string }) {
  const na = Number.parseInt(a.nome, 10);
  const nb = Number.parseInt(b.nome, 10);
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.nome.localeCompare(b.nome);
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return na - nb;
}


function montarLinha(p: {
  e: EmpresaNewton;
  calc: CalculoNewton;
  filiais: FilialSimples[];
  equiparacao: EquiparacaoNewton | null;
  prefeitura: { valor: number | null; erro: string | null } | null;
  central: ConferenciaCentralIss | null;
  conferencia: LinhaNewton["conferencia"];
  motivos: Motivo[];
  motivosAceitos: LinhaNewton["motivosAceitos"];
  assinatura: string;
  aprovada: boolean;
  mitEncerrado: boolean;
  newton: NewtonFechamento | null;
  temGrupo: boolean;
}): LinhaNewton {
  const { e, calc, newton } = p;
  const municipio = e.municipality_ibge_code === IBGE_PETROPOLIS ? "Petrópolis" : e.municipality_ibge_code === IBGE_RIO ? "Rio de Janeiro" : "Outro";
  const etapas: Etapa[] = [];
  const add = (chave: string, nome: string, estado: EstadoEtapa, titulo: string, detalhe?: string) => etapas.push({ chave, nome, estado, titulo, detalhe });

  const erroBusca = e.ultima_sincronizacao_status === "erro";
  add("notas", "Notas", erroBusca ? "problema" : "ok", erroBusca ? "Erro na busca" : calc.receitaMes ? "Buscadas" : "Sem notas", erroBusca ? (e.ultima_sincronizacao_erro ?? "").slice(0, 60) : brl(calc.receitaMes));

  const dataCentral = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");
  if (municipio === "Rio de Janeiro" || (municipio === "Petrópolis" && usarCentralPetropolis(p.prefeitura, p.central, calc.receitaMes))) {
    const c = p.central;
    const onde = municipio === "Rio de Janeiro" ? "Central ISS Rio" : "Central ISS Petrópolis";
    if (!c) add("prefeitura", "Prefeitura", "pendente", "Não conferido", onde);
    else
      add(
        "prefeitura",
        "Prefeitura",
        CENTRAL_OK.has(c.status) ? "ok" : c.status === "sem_guia" ? "pendente" : "problema",
        ROTULO_CENTRAL[c.status] ?? c.status,
        c.status === "paga" ? `${onde} · ${c.mensagem ?? ""}` : `${onde} · ${dataCentral(c.conferidoEm)}`,
      );
  } else if (municipio === "Petrópolis") {
    if (!p.prefeitura) add("prefeitura", "Prefeitura", "pendente", "Não conferido");
    else if (p.prefeitura.erro) add("prefeitura", "Prefeitura", "problema", "Erro na consulta", p.prefeitura.erro.slice(0, 60));
    else {
      const dif = Math.abs((p.prefeitura.valor ?? 0) - calc.receitaMes);
      add("prefeitura", "Prefeitura", dif <= 1 ? "ok" : "problema", dif <= 1 ? "Confere" : "Diferença", `Prefeitura ${brl(p.prefeitura.valor ?? 0)}`);
    }
  } else add("prefeitura", "Prefeitura", "na", "—");

  const bloqueado = p.conferencia === "BLOQUEADO";
  add(
    "calculo",
    "Cálculo",
    bloqueado ? "problema" : "ok",
    bloqueado ? "Bloqueado" : "Calculado",
    `${brl(calc.total)}${calc.fechaTrimestre ? " · c/ IRPJ/CSLL" : " · PIS/COFINS"}`,
  );
  add(
    "conferencia",
    "Conferência",
    p.conferencia === "OK" || p.aprovada ? "ok" : p.conferencia === "REVISAR" ? "pendente" : "problema",
    p.aprovada ? (p.conferencia === "OK" ? "OK" : "Aprovada") : p.conferencia === "REVISAR" ? "Revisar" : "Bloqueada",
    p.motivos.length ? `${p.motivos.length} motivo(s)` : undefined,
  );
  add("mit", "MIT", p.mitEncerrado ? "ok" : "pendente", p.mitEncerrado ? "Encerrado" : "Não encerrado");
  add("dctfweb", "DCTFWeb", newton?.dctfweb_transmitida_em ? "ok" : "pendente", newton?.dctfweb_transmitida_em ? "Transmitida" : "Não transmitida");
  const semDarf = calc.total <= 0.009;
  add("darf", "DARF", semDarf ? "na" : newton?.darf_gerado_em ? "ok" : "pendente", semDarf ? "Sem DARF" : newton?.darf_gerado_em ? "Gerado" : "Não gerado", newton?.darf_valor != null ? brl(Number(newton.darf_valor)) : undefined);
  add("entrega", "Entrega", newton?.entregue_em ? "ok" : semDarf ? "na" : "pendente", newton?.entregue_em ? "eContador" : "Não entregue");
  add("pagamento", "Pagamento", semDarf ? "na" : newton?.pago ? "ok" : newton?.pago === false ? "problema" : "pendente", semDarf ? "—" : newton?.pago ? "Pago" : newton?.pago === false ? "Em aberto" : "Não verificado");

  let situacao: LinhaNewton["situacao"] = "newton";
  let recado: string;
  const iaAtual = newton?.ia_decisao && newton.ia_assinatura === p.assinatura;
  if (bloqueado) {
    situacao = "acao";
    recado = p.motivos.filter((m) => m.nivel === "BLOQUEADO").map((m) => m.texto).join(" ");
  } else if (!p.aprovada) {
    if (iaAtual && newton!.ia_decisao === "ESCALAR") {
      situacao = "acao";
      recado = `Precisa de você: ${newton!.ia_pergunta ?? newton!.ia_diagnostico ?? "ver motivos"}`;
    } else if (iaAtual && newton!.ia_decisao === "APROVAR") {
      situacao = "acao";
      recado = `Revisei e recomendo aprovar: ${newton!.ia_justificativa ?? ""}`;
    } else recado = `Aguardando minha revisão: ${p.motivos.map((m) => m.texto).join(" ")}`;
  } else if (!p.mitEncerrado) {
    situacao = "acao";
    recado = calc.total > 0 ? `Pronta para encerrar o MIT (${brl(calc.total)}).` : "Pronta para encerrar o MIT (sem débito no mês).";
  } else if (!newton?.dctfweb_transmitida_em) {
    situacao = "acao";
    recado = "MIT encerrado — falta transmitir a DCTFWeb.";
  } else if (semDarf) {
    situacao = "concluida";
    recado = "Concluída: DCTFWeb transmitida, sem DARF a pagar.";
  } else if (!newton?.darf_gerado_em) {
    situacao = "acao";
    recado = "DCTFWeb transmitida — falta gerar e salvar o DARF.";
  } else if (!newton?.entregue_em) {
    situacao = "acao";
    recado = "DARF salvo — falta entregar no eContador (ZIP).";
  } else if (!newton.pago) {
    recado = newton.mensagem_cobranca_em ? "Entregue — cobrança enviada, aguardando pagamento." : "Entregue — aguardando pagamento.";
  } else {
    situacao = "concluida";
    recado = "Concluída: DARF pago.";
  }

  return {
    id: e.id,
    nome: nomeEmpresaNewton(e),
    municipio,
    issFixo: e.iss_tipo === "FIXO",
    equiparacaoCadastro: e.equiparacao_hospitalar,
    calc,
    filiais: p.filiais,
    equiparacao: p.equiparacao,
    conferencia: p.conferencia,
    motivos: p.motivos,
    motivosAceitos: p.motivosAceitos,
    assinatura: p.assinatura,
    aprovada: p.aprovada,
    mitEncerrado: p.mitEncerrado,
    newton,
    temGrupoDigisac: p.temGrupo,
    etapas,
    situacao,
    recado,
  };
}
