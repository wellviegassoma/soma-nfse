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
  return lista;
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
  const [extras, dasPagamentos, { data: declaracoes }, dados, { data: fechamentos }, { data: vinculos }] = await Promise.all([
    buscarExtrasConferencia(db, competencia, ids),
    buscarDasPagamentos(db, competencia),
    db.from("integra_contador_pgdas_declaracoes").select("company_id, id_declaracao").eq("competencia", competencia).in("company_id", ids),
    carregarDadosSimplesLote(db, ids),
    db.from("serena_fechamentos").select("*").eq("competencia", competencia).in("company_id", ids),
    db.from("pedido_nota_vinculos").select("company_id").in("company_id", ids),
  ]);
  const declaradas = new Set((declaracoes ?? []).filter((d) => d.id_declaracao).map((d) => d.company_id as string));
  const serenaPor = new Map((fechamentos ?? []).map((f) => [f.company_id as string, f as unknown as SerenaFechamento]));
  const comGrupo = new Set((vinculos ?? []).map((v) => v.company_id as string));

  return Promise.all(
    empresas.map(async (e) => {
      const prefeitura = extras.prefeitura.get(e.id) ?? null;
      const aprovacao = extras.aprovacoes.get(e.id) ?? null;
      const d = dados.get(e.id);
      const calc = await calcularSimplesEmpresa(db, e, competencia, { prefeitura, aprovacao }, d);
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
      });
    }),
  );
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
}): LinhaSerena {
  const { e, calc, serena } = p;
  const municipio = e.municipality_ibge_code === IBGE_PETROPOLIS ? "Petrópolis" : e.municipality_ibge_code === IBGE_RIO ? "Rio de Janeiro" : "Outro";
  const conf = calc.conferencia.status;
  const semDas = calc.dasLiquido <= 0;
  const etapas: Etapa[] = [];

  // 1. Notas
  etapas.push({
    chave: "notas",
    nome: "Notas",
    estado: "ok",
    titulo: p.qtdNotas ? "Buscadas" : "Sem notas",
    detalhe: `${p.qtdNotas} nota(s) · ${brl(calc.receitaMes)}`,
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
    etapas.push({ chave: "prefeitura", nome: "Prefeitura", estado: "pendente", titulo: "Só base nacional", detalhe: "Nota Carioca ainda não conferida" });
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
    etapas,
    situacao,
    recado,
  };
}
