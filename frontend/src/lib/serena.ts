import "server-only";

// Serena — carteira de IA do Simples Nacional (docs/simples-operacao-automatica.md).
//
// A esteira de cada empresa é LIDA do que o sistema já tem (notas, conferência
// com a Prefeitura, cálculo e aprovação da Central do Simples, PGDAS, pagamento)
// + o que é da Serena (serena_fechamentos: decisão da IA, DAS salvo, entrega,
// mensagens). Nada aqui transmite ou paga — só monta o retrato.

import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarDasPagamentos } from "@/lib/pagamentos-federais";
import {
  COLUNAS_EMPRESA_SIMPLES,
  buscarExtrasConferencia,
  calcularSimplesEmpresa,
  carregarDadosSimplesLote,
  type CalculoSimples,
  type DadosSimplesEmpresa,
  type EmpresaSimples,
} from "@/lib/simples-linha";
import { IBGE_PETROPOLIS, IBGE_RIO } from "@/lib/tarefas-comum";

type Db = SupabaseClient;

export const SERENA_MUNICIPIOS = [IBGE_PETROPOLIS, IBGE_RIO];

export type EstadoEtapa = "ok" | "pendente" | "problema" | "na";
export type Etapa = { chave: string; nome: string; estado: EstadoEtapa; titulo: string; detalhe?: string };

export type SerenaFechamento = {
  ia_decisao: "APROVAR" | "ESCALAR" | null;
  ia_justificativa: string | null;
  ia_pergunta: string | null;
  ia_diagnostico: string | null;
  ia_acoes: { acao: string; onde: string }[] | null;
  ia_assinatura: string | null;
  ia_em: string | null;
  escalado_para: string | null;
  tarefa_id: string | null;
  das_blob_pathname: string | null;
  das_gerado_em: string | null;
  entregue_em: string | null;
  mensagem_guia_em: string | null;
  mensagem_cobranca_em: string | null;
};

export type LinhaSerena = {
  id: string;
  nome: string;
  municipio: "Petrópolis" | "Rio de Janeiro" | "Outro";
  receita: number;
  qtdNotas: number;
  das: number;
  anexo: string;
  fatorR: number | null;
  conferencia: "OK" | "REVISAR" | "BLOQUEADO";
  motivos: { nivel: string; codigo: string; texto: string }[];
  aprovada: boolean; // conferência aprovada (ou OK) = liberada para transmitir
  assinatura: string;
  declarada: boolean;
  pago: boolean | null;
  serena: SerenaFechamento | null;
  temGrupoDigisac: boolean;
  /** Guias de ISS na Nota Carioca fora do DAS (Rio): pendentes e emitidas a entregar. */
  guiasIss: {
    pendentes: { competencia: string; valor: number | null; receita: string | null }[];
    emitidasAEntregar: string[];
    consultadoEm: string | null;
    erro: string | null;
  };
  etapas: Etapa[];
  /** Onde parou: "acao" = precisa de gente; "serena" = em andamento automático; "concluida". */
  situacao: "acao" | "serena" | "concluida";
  recado: string;
};

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Empresas da carteira: Simples ativas de Petrópolis/Rio + incluídas − excluídas. */
export async function carteiraSerena(db: Db): Promise<EmpresaSimples[]> {
  const [{ data: base, error }, { data: excecoes }] = await Promise.all([
    db
      .from("companies")
      .select(COLUNAS_EMPRESA_SIMPLES)
      .eq("tax_regime", "SIMPLES_NACIONAL")
      .eq("ativa", true)
      .not("cnpj", "is", null)
      .in("municipality_ibge_code", SERENA_MUNICIPIOS)
      .order("legal_name"),
    db.from("serena_excecoes").select("company_id, tipo"),
  ]);
  if (error) throw new Error(error.message);
  const excluir = new Set((excecoes ?? []).filter((x) => x.tipo === "EXCLUIR").map((x) => x.company_id as string));
  const incluirIds = (excecoes ?? []).filter((x) => x.tipo === "INCLUIR").map((x) => x.company_id as string);
  const lista = ((base ?? []) as EmpresaSimples[]).filter((e) => !excluir.has(e.id));
  const ja = new Set(lista.map((e) => e.id));
  const faltam = incluirIds.filter((id) => !ja.has(id));
  if (faltam.length) {
    const { data: extras } = await db.from("companies").select(COLUNAS_EMPRESA_SIMPLES).in("id", faltam);
    lista.push(...((extras ?? []) as EmpresaSimples[]));
  }
  // Filial (CNPJ de mesma raiz, ordem ≠ 0001) não declara à parte no Simples:
  // entra na declaração da matriz. Sai da esteira; os dados somam na matriz.
  const raizesComMatriz = new Set(lista.filter((e) => ordemCnpj(e) === "0001").map((e) => raizCnpj(e)));
  return lista.filter((e) => ordemCnpj(e) === "0001" || !raizesComMatriz.has(raizCnpj(e)));
}

const raizCnpj = (e: { cnpj: string | null }) => (e.cnpj ?? "").replace(/\D/g, "").slice(0, 8);
const ordemCnpj = (e: { cnpj: string | null }) => (e.cnpj ?? "").replace(/\D/g, "").slice(8, 12);

export type FilialSimples = { id: string; cnpj: string; nome: string };

/** Filiais ativas do Simples de cada matriz da lista (mesma raiz de CNPJ). */
export async function filiaisPorMatriz(db: Db, matrizes: EmpresaSimples[]): Promise<Map<string, FilialSimples[]>> {
  const mapa = new Map<string, FilialSimples[]>();
  const porRaiz = new Map(matrizes.filter((e) => ordemCnpj(e) === "0001").map((e) => [raizCnpj(e), e.id]));
  if (!porRaiz.size) return mapa;
  const { data } = await db
    .from("companies")
    .select("id, cnpj, legal_name, trade_name, codigo_cliente")
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .eq("ativa", true)
    .not("cnpj", "is", null);
  for (const f of data ?? []) {
    const cnpj = String(f.cnpj);
    const matrizId = porRaiz.get(raizCnpj({ cnpj }));
    if (!matrizId || ordemCnpj({ cnpj }) === "0001" || f.id === matrizId) continue;
    const lista = mapa.get(matrizId) ?? [];
    lista.push({ id: f.id as string, cnpj, nome: `${f.codigo_cliente ?? ""} · ${f.trade_name || f.legal_name}` });
    mapa.set(matrizId, lista);
  }
  return mapa;
}

/** Junta os dados das filiais nos da matriz (receita, folha e retenções da empresa toda). */
export function somarDadosFiliais(matriz: DadosSimplesEmpresa | undefined, filiais: (DadosSimplesEmpresa | undefined)[]): DadosSimplesEmpresa | undefined {
  if (!matriz) return matriz;
  const todas = [matriz, ...filiais.filter((d): d is DadosSimplesEmpresa => d != null)];
  if (todas.length <= 1) return matriz;
  // Receita manual é o total da empresa (vem do PGDAS-D, que é por raiz de
  // CNPJ) — a filial costuma ter a mesma cópia (FVS 185/216). Vale só a da
  // matriz; a filial entra só em mês que a matriz não tem.
  const manual = new Map(todas[0].receitaManualPorMes);
  for (const d of todas.slice(1)) for (const [m, v] of d.receitaManualPorMes) if (!manual.has(m)) manual.set(m, v);
  // Folha: a do Resumo é por CNPJ (soma); a do PGDAS-D é da empresa toda e
  // aparece repetida na filial — mês com o mesmo total da matriz conta uma vez.
  const total = (f: DadosSimplesEmpresa["folhaMensal"][number]) => f.valor + (f.proLabore ?? 0) + (f.fgts ?? 0);
  const folha = new Map<string, DadosSimplesEmpresa["folhaMensal"][number]>();
  for (const d of todas)
    for (const f of d.folhaMensal) {
      const a = folha.get(f.competencia);
      if (a && Math.abs(total(a) - total(f)) < 0.01) continue;
      folha.set(
        f.competencia,
        a
          ? {
              competencia: f.competencia,
              valor: a.valor + f.valor,
              proLabore: a.proLabore == null && f.proLabore == null ? null : (a.proLabore ?? 0) + (f.proLabore ?? 0),
              fgts: a.fgts == null && f.fgts == null ? null : (a.fgts ?? 0) + (f.fgts ?? 0),
            }
          : { ...f },
      );
    }
  return {
    notasMensais: todas.flatMap((d) => d.notasMensais),
    notasPorAtividade: todas.flatMap((d) => d.notasPorAtividade),
    receitaManualPorMes: manual,
    folhaMensal: [...folha.values()],
    retencoes: todas.flatMap((d) => d.retencoes),
  };
}

export function nomeEmpresaSimples(e: EmpresaSimples) {
  const nome = e.trade_name || e.legal_name;
  return e.codigo_cliente ? `${e.codigo_cliente} · ${nome}` : nome;
}

/** Monta a esteira de todas as empresas da carteira na competência. */
export async function carregarEsteira(db: Db, competencia: string): Promise<LinhaSerena[]> {
  const empresas = await carteiraSerena(db);
  const ids = empresas.map((e) => e.id);
  if (!ids.length) return [];
  const filiais = await filiaisPorMatriz(db, empresas);
  const idsFiliais = [...filiais.values()].flat().map((f) => f.id);
  const [extras, dasPagamentos, { data: declaracoes }, dados, { data: fechamentos }, { data: vinculos }] = await Promise.all([
    buscarExtrasConferencia(db, competencia, ids),
    buscarDasPagamentos(db, competencia),
    db.from("integra_contador_pgdas_declaracoes").select("company_id, id_declaracao").eq("competencia", competencia).in("company_id", ids),
    carregarDadosSimplesLote(db, [...ids, ...idsFiliais]),
    db.from("serena_fechamentos").select("*").eq("competencia", competencia).in("company_id", ids),
    db.from("pedido_nota_vinculos").select("company_id").in("company_id", ids),
  ]);
  const { data: syncs } = await db
    .from("companies")
    .select("id, ultima_sincronizacao_em, ultima_sincronizacao_status, ultima_sincronizacao_erro")
    .in("id", ids);
  const syncPor = new Map((syncs ?? []).map((s) => [s.id as string, s]));
  const [{ data: guias }, { data: consultasGuias }] = await Promise.all([
    db.from("serena_guias_iss").select("company_id, competencia, valor, receitas, status, entregue_em").in("company_id", ids),
    db.from("serena_guias_iss_consultas").select("company_id, consultado_em, erro").in("company_id", ids),
  ]);
  const consultaGuiaPor = new Map((consultasGuias ?? []).map((c) => [c.company_id as string, c]));
  const guiasPor = (companyId: string) => {
    const g = (guias ?? []).filter((x) => x.company_id === companyId);
    const c = consultaGuiaPor.get(companyId);
    return {
      pendentes: g
        // Guia zerada na grade (ex.: mês sem ISS a pagar) não é pendência.
        .filter((x) => x.status === "PENDENTE" && (x.valor == null || Number(x.valor) > 0))
        .map((x) => ({
          competencia: x.competencia as string,
          valor: x.valor == null ? null : Number(x.valor),
          receita: Array.isArray(x.receitas) && x.receitas.length ? String((x.receitas as { codigo: string }[])[0].codigo) : null,
        }))
        .sort((a, b) => a.competencia.localeCompare(b.competencia)),
      emitidasAEntregar: g.filter((x) => x.status === "EMITIDA" && !x.entregue_em).map((x) => x.competencia as string),
      consultadoEm: (c?.consultado_em as string | undefined) ?? null,
      erro: (c?.erro as string | undefined) ?? null,
    };
  };
  const declaradas = new Set((declaracoes ?? []).filter((d) => d.id_declaracao).map((d) => d.company_id as string));
  const serenaPor = new Map((fechamentos ?? []).map((f) => [f.company_id as string, f as unknown as SerenaFechamento]));
  const comGrupo = new Set((vinculos ?? []).map((v) => v.company_id as string));

  return Promise.all(
    empresas.map(async (e) => {
      const prefeitura = extras.prefeitura.get(e.id) ?? null;
      const aprovacao = extras.aprovacoes.get(e.id) ?? null;
      const minhas = filiais.get(e.id) ?? [];
      const d = somarDadosFiliais(dados.get(e.id), minhas.map((f) => dados.get(f.id)));
      const calc = await calcularSimplesEmpresa(db, e, competencia, { prefeitura, aprovacao }, d);
      bloquearSeFilialFaturou(calc, minhas, dados, competencia);
      const notasMes = (d?.notasMensais ?? []).filter((n) => n.competencia === competencia && !n.cancelada);
      const pag = dasPagamentos.get(e.id);
      return montarLinha({
        e,
        calc,
        qtdNotas: notasMes.length,
        prefeitura,
        aprovada: calc.liberado,
        declarada: declaradas.has(e.id),
        pago: pag ? pag.status === "pago" : null,
        serena: serenaPor.get(e.id) ?? null,
        temGrupo: comGrupo.has(e.id),
        sync: syncPor.get(e.id) ?? null,
        guiasIss: guiasPor(e.id),
      });
    }),
  );
}

// A transmissão do sistema (declarar/route) ainda manda só o estabelecimento
// da matriz. Se a filial faturou no mês, o PGDAS precisa dos dois — bloqueia
// para a equipe declarar à mão, em vez de declarar a receita toda na matriz.
export function bloquearSeFilialFaturou(
  calc: CalculoSimples,
  filiais: FilialSimples[],
  dados: Map<string, DadosSimplesEmpresa>,
  competencia: string,
) {
  for (const f of filiais) {
    const v = (dados.get(f.id)?.notasMensais ?? []).filter((n) => n.competencia === competencia && !n.cancelada).reduce((t, n) => t + n.valor, 0);
    if (v > 0) {
      const texto = `A filial ${f.nome} faturou ${brl(v)} no mês: o PGDAS-D vai com os dois estabelecimentos (matriz e filial) — declarar pelo portal; o envio automático só manda a matriz.`;
      calc.bloqueios.push(texto);
      calc.conferencia = { ...calc.conferencia, status: "BLOQUEADO", motivos: [...calc.conferencia.motivos, { nivel: "BLOQUEADO", codigo: "FILIAL_FATUROU", texto }] };
      calc.liberado = false;
    }
  }
}

function montarLinha(p: {
  e: EmpresaSimples;
  calc: CalculoSimples;
  qtdNotas: number;
  prefeitura: { valor: number | null; erro: string | null } | null;
  aprovada: boolean;
  declarada: boolean;
  pago: boolean | null;
  serena: SerenaFechamento | null;
  temGrupo: boolean;
  sync: { ultima_sincronizacao_em: string | null; ultima_sincronizacao_status: string | null; ultima_sincronizacao_erro: string | null } | null;
  guiasIss: LinhaSerena["guiasIss"];
}): LinhaSerena {
  const { e, calc, serena } = p;
  const municipio = e.municipality_ibge_code === IBGE_PETROPOLIS ? "Petrópolis" : e.municipality_ibge_code === IBGE_RIO ? "Rio de Janeiro" : "Outro";
  const conf = calc.conferencia.status;
  const semDas = calc.dasLiquido <= 0;
  const etapas: Etapa[] = [];

  // 1. Notas
  const erroBusca = p.sync?.ultima_sincronizacao_status === "erro";
  etapas.push({
    chave: "notas",
    nome: "Notas",
    estado: erroBusca ? "problema" : "ok",
    titulo: erroBusca ? "Erro na busca" : p.qtdNotas ? "Buscadas" : "Sem notas",
    detalhe: erroBusca ? (p.sync?.ultima_sincronizacao_erro ?? "").slice(0, 60) : `${p.qtdNotas} nota(s) · ${brl(calc.receitaMes)}`,
  });

  // 2. Faturamento na prefeitura
  if (municipio === "Petrópolis") {
    if (!p.prefeitura) etapas.push({ chave: "prefeitura", nome: "Prefeitura", estado: "pendente", titulo: "Não conferido" });
    else if (p.prefeitura.erro) etapas.push({ chave: "prefeitura", nome: "Prefeitura", estado: "problema", titulo: "Erro na consulta", detalhe: p.prefeitura.erro.slice(0, 60) });
    else {
      const dif = Math.abs((p.prefeitura.valor ?? 0) - calc.receitaMes);
      etapas.push({
        chave: "prefeitura",
        nome: "Prefeitura",
        estado: dif < 0.01 ? "ok" : "problema",
        titulo: dif < 0.01 ? "Conferido" : "Diferença",
        detalhe: `Prefeitura ${brl(p.prefeitura.valor ?? 0)}`,
      });
    }
  } else {
    // Rio: o Simples emite pela NFS-e Nacional (confirmado na Nota Carioca em
    // 24/11/2026 — a grade chama as notas de "NFS-e Nacional"), então a base
    // nacional já é a fonte completa; vale a busca de notas ter dado certo.
    etapas.push(
      erroBusca
        ? { chave: "prefeitura", nome: "Prefeitura", estado: "problema", titulo: "Base nacional com erro", detalhe: "refazer a busca de notas" }
        : { chave: "prefeitura", nome: "Prefeitura", estado: "ok", titulo: "NFS-e Nacional", detalhe: "Rio emite pela base nacional" },
    );
  }

  // 3. Cálculo
  etapas.push({
    chave: "calculo",
    nome: "Cálculo",
    estado: calc.bloqueios.length ? "problema" : "ok",
    titulo: calc.bloqueios.length ? "Bloqueado" : "Calculado",
    detalhe: `${brl(calc.dasLiquido)} · Anexo ${calc.anexo}${calc.fatorR != null ? ` · FR ${(calc.fatorR * 100).toFixed(1)}%` : ""}`,
  });

  // 4. Conferência (+ Serena)
  const iaAtual = serena?.ia_decisao && serena.ia_assinatura === calc.assinatura ? serena : null;
  etapas.push({
    chave: "conferencia",
    nome: "Conferência",
    estado: p.aprovada ? "ok" : conf === "BLOQUEADO" ? "problema" : iaAtual?.ia_decisao === "ESCALAR" ? "problema" : "pendente",
    titulo: p.aprovada
      ? conf === "OK"
        ? "OK"
        : "Aprovada"
      : conf === "BLOQUEADO"
        ? "Bloqueada"
        : iaAtual?.ia_decisao === "APROVAR"
          ? "Serena aprovou"
          : iaAtual?.ia_decisao === "ESCALAR"
            ? "Com a equipe"
            : "Revisar",
    detalhe: calc.conferencia.motivos.length ? `${calc.conferencia.motivos.length} motivo(s)` : undefined,
  });

  // 5. PGDAS
  etapas.push({ chave: "pgdas", nome: "PGDAS", estado: p.declarada ? "ok" : "pendente", titulo: p.declarada ? "Transmitido" : "Não transmitido" });

  // 6. DAS
  etapas.push(
    semDas && p.declarada
      ? { chave: "das", nome: "DAS", estado: "na", titulo: "Sem DAS", detalhe: "R$ 0,00" }
      : { chave: "das", nome: "DAS", estado: serena?.das_gerado_em ? "ok" : "pendente", titulo: serena?.das_gerado_em ? "Gerado" : "Não gerado", detalhe: brl(calc.dasLiquido) },
  );

  // 7. Entrega (eContador)
  etapas.push(
    semDas && p.declarada
      ? { chave: "entrega", nome: "Entrega", estado: "na", titulo: "Não precisa" }
      : { chave: "entrega", nome: "Entrega", estado: serena?.entregue_em ? "ok" : "pendente", titulo: serena?.entregue_em ? "No eContador" : "Não entregue" },
  );

  // 8. Pagamento
  etapas.push(
    semDas && p.declarada
      ? { chave: "pagamento", nome: "Pagamento", estado: "na", titulo: "—" }
      : {
          chave: "pagamento",
          nome: "Pagamento",
          estado: p.pago ? "ok" : p.pago === false ? "pendente" : "pendente",
          titulo: p.pago ? "Pago" : p.pago === false ? "Não pago" : "Não verificado",
          detalhe: serena?.mensagem_cobranca_em ? "cobrança enviada" : undefined,
        },
  );

  // Onde parou + recado da Serena
  let situacao: LinhaSerena["situacao"] = "serena";
  let recado: string;
  const primeiroMotivo = calc.conferencia.motivos[0]?.texto;
  if (conf === "BLOQUEADO") {
    situacao = "acao";
    recado = `Bloqueada: ${calc.bloqueios[0] ?? primeiroMotivo ?? "ver Central do Simples"}`;
  } else if (!p.aprovada && iaAtual?.ia_decisao === "ESCALAR") {
    situacao = "acao";
    recado = `Precisa da equipe: ${iaAtual.ia_diagnostico ?? iaAtual.ia_pergunta ?? iaAtual.ia_justificativa ?? ""}`;
  } else if (!p.aprovada && iaAtual?.ia_decisao === "APROVAR") {
    situacao = "acao";
    recado = `Serena recomenda aprovar: ${iaAtual.ia_justificativa ?? ""} — falta a aprovação final.`;
  } else if (!p.aprovada) {
    recado = `Aguardando revisão da Serena: ${primeiroMotivo ?? "conferência"}`;
  } else if (!p.declarada) {
    situacao = "acao";
    recado = `Pronta para transmitir (${brl(calc.dasLiquido)}).`;
  } else if (semDas) {
    situacao = "concluida";
    recado = calc.receitaMes > 0 ? "Transmitida — retenções zeraram o DAS." : "Sem movimento — declarada com faturamento zero.";
  } else if (!serena?.das_gerado_em) {
    recado = "Transmitida — falta gerar e salvar o DAS.";
  } else if (!serena.entregue_em) {
    situacao = "acao";
    recado = "DAS salvo — subir no eContador e marcar entregue.";
  } else if (!p.pago) {
    recado = serena.mensagem_cobranca_em ? "Entregue — cobrança enviada, aguardando pagamento." : "Entregue — aguardando pagamento.";
  } else {
    situacao = "concluida";
    recado = "Concluída: DAS pago.";
  }

  return {
    id: e.id,
    nome: nomeEmpresaSimples(e),
    municipio,
    receita: calc.receitaMes,
    qtdNotas: p.qtdNotas,
    das: calc.dasLiquido,
    anexo: calc.anexo,
    fatorR: calc.fatorR,
    conferencia: conf,
    motivos: calc.conferencia.motivos,
    aprovada: p.aprovada,
    assinatura: calc.assinatura,
    declarada: p.declarada,
    pago: p.pago,
    serena,
    temGrupoDigisac: p.temGrupo,
    guiasIss: p.guiasIss,
    etapas,
    situacao,
    recado,
  };
}
