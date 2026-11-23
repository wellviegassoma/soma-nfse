import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe } from "@/lib/tarefas";
import { formatarCpf } from "@/lib/formatters";
import {
  HONORARIO_LABEL,
  RESULTADO_LABEL,
  STATUS_LABEL,
  TIPO_CONTA_LABEL,
  dataBr,
  type HonorarioStatus,
  type ResumoGravado,
  type StatusDeclaracao,
} from "./comum";

// Planilhas do IRPF (contribuintes e declarações do exercício). A de
// declarações leva o id e uma coluna "Honorário novo" em branco: o
// Wellington preenche o reajuste e devolve a planilha para atualizar em lote.

const COR_MARCA = "FF1D4ED8";
const MOEDA = "R$ #,##0.00";

type Coluna = { header: string; key: string; width: number; style?: Partial<ExcelJS.Style> };

function planilha(nome: string, colunas: Coluna[], linhas: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nome, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = colunas;
  ws.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  ws.getRow(1).height = 30;
  for (const l of linhas) ws.addRow(l);
  ws.autoFilter = { from: "A1", to: `${ws.getColumn(colunas.length).letter}${linhas.length + 1}` };
  return wb;
}

const fone = (t: string | null) => (t ? (t.length >= 10 ? `(${t.slice(0, 2)}) ${t.slice(2, -4)}-${t.slice(-4)}` : t) : "");
const simNao = (b: boolean | null) => (b === null ? "" : b ? "Sim" : "Não");

export async function planilhaContribuintes(supabase: SupabaseClient): Promise<Buffer> {
  const [contribuintes, decls, equipe] = await Promise.all([
    buscarTudoPaginado<Record<string, unknown>>((from, to) =>
      supabase.from("irpf_contribuintes").select("*").order("nome").order("id").range(from, to),
    ),
    buscarTudoPaginado<{ contribuinte_id: string; exercicio: number }>((from, to) =>
      supabase.from("irpf_declaracoes").select("contribuinte_id, exercicio").order("id").range(from, to),
    ),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const anos = new Map<string, number[]>();
  for (const d of decls) anos.set(d.contribuinte_id, [...(anos.get(d.contribuinte_id) ?? []), d.exercicio]);

  const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const linhas = contribuintes.map((c) => ({
    nome: c.nome,
    cpf: formatarCpf(s(c.cpf)),
    nascimento: dataBr(c.nascimento as string | null),
    ativo: c.ativo ? "Sim" : "Não",
    responsavel: c.responsavel_id ? nomeEquipe.get(c.responsavel_id as string) ?? "" : "",
    email: s(c.email),
    celular: fone(c.celular as string | null) || fone(c.telefone as string | null),
    fixo: fone(c.telefone_fixo as string | null),
    endereco: [[c.tipo_logradouro, c.logradouro].filter(Boolean).join(" "), c.numero, c.complemento].filter(Boolean).join(", "),
    bairro: s(c.bairro),
    municipio: s(c.municipio),
    uf: s(c.uf),
    cep: s(c.cep),
    titulo: s(c.titulo_eleitor),
    ocupacao: s(c.ocupacao_codigo),
    natureza: s(c.natureza_ocupacao_codigo),
    conjuge: simNao(c.tem_conjuge as boolean | null),
    cpfConjuge: c.cpf_conjuge ? formatarCpf(s(c.cpf_conjuge)) : "",
    tipoConta: c.tipo_conta ? TIPO_CONTA_LABEL[s(c.tipo_conta)] ?? s(c.tipo_conta) : "",
    banco: s(c.banco),
    agencia: s(c.agencia),
    conta: c.conta ? `${s(c.conta)}${c.conta_dv ? `-${s(c.conta_dv)}` : ""}` : "",
    doenca: simNao(c.doenca_grave as boolean | null),
    exercicios: (anos.get(c.id as string) ?? []).sort().join(", "),
    cadastroDe: s(c.cadastro_exercicio),
    observacoes: s(c.observacoes),
  }));

  const wb = planilha(
    "Contribuintes",
    [
      { header: "Nome", key: "nome", width: 38 },
      { header: "CPF", key: "cpf", width: 16 },
      { header: "Nascimento", key: "nascimento", width: 12 },
      { header: "Ativo", key: "ativo", width: 7 },
      { header: "Responsável pela declaração", key: "responsavel", width: 22 },
      { header: "E-mail", key: "email", width: 30 },
      { header: "Celular", key: "celular", width: 16 },
      { header: "Telefone fixo", key: "fixo", width: 16 },
      { header: "Endereço", key: "endereco", width: 40 },
      { header: "Bairro", key: "bairro", width: 20 },
      { header: "Município", key: "municipio", width: 20 },
      { header: "UF", key: "uf", width: 5 },
      { header: "CEP", key: "cep", width: 10 },
      { header: "Título de eleitor", key: "titulo", width: 15 },
      { header: "Ocupação (cód. RFB)", key: "ocupacao", width: 11 },
      { header: "Natureza ocupação (cód. RFB)", key: "natureza", width: 11 },
      { header: "Cônjuge", key: "conjuge", width: 8 },
      { header: "CPF do cônjuge", key: "cpfConjuge", width: 16 },
      { header: "Restituição: tipo", key: "tipoConta", width: 16 },
      { header: "Banco", key: "banco", width: 7 },
      { header: "Agência", key: "agencia", width: 8 },
      { header: "Conta", key: "conta", width: 16 },
      { header: "Doença grave / deficiência", key: "doenca", width: 10 },
      { header: "Exercícios no sistema", key: "exercicios", width: 16 },
      { header: "Cadastro lido da declaração", key: "cadastroDe", width: 12 },
      { header: "Observações", key: "observacoes", width: 30 },
    ],
    linhas,
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}

type DeclLinha = {
  id: string;
  contribuinte_id: string;
  exercicio: number;
  status: StatusDeclaracao;
  responsavel_id: string | null;
  revisor_id: string | null;
  completa: boolean | null;
  retificadora: boolean;
  resultado: keyof typeof RESULTADO_LABEL | null;
  imposto_pagar: number | null;
  imposto_restituir: number | null;
  quotas: number | null;
  numero_recibo: string | null;
  transmitida_em: string | null;
  resumo: ResumoGravado | null;
  honorario_valor: number | null;
  honorario_status: HonorarioStatus;
  observacoes: string | null;
  irpf_contribuintes: { nome: string; cpf: string } | null;
};

export async function planilhaDeclaracoes(supabase: SupabaseClient, exercicio: number): Promise<Buffer> {
  const [decls, anteriores, equipe] = await Promise.all([
    buscarTudoPaginado<DeclLinha>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select("*, irpf_contribuintes(nome, cpf)")
        .eq("exercicio", exercicio)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: DeclLinha[] | null; error: { message: string } | null }>,
    ),
    buscarTudoPaginado<{ contribuinte_id: string; honorario_valor: number | null }>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select("contribuinte_id, honorario_valor")
        .eq("exercicio", exercicio - 1)
        .order("id")
        .range(from, to),
    ),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const honorarioAnterior = new Map(anteriores.map((a) => [a.contribuinte_id, a.honorario_valor]));
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

  const linhas = decls
    .sort((a, b) => (a.irpf_contribuintes?.nome ?? "").localeCompare(b.irpf_contribuintes?.nome ?? ""))
    .map((d) => {
      const t = d.resumo?.totais;
      return {
        id: d.id,
        nome: d.irpf_contribuintes?.nome ?? "",
        cpf: formatarCpf(d.irpf_contribuintes?.cpf ?? ""),
        exercicio: d.exercicio,
        situacao: STATUS_LABEL[d.status],
        responsavel: d.responsavel_id ? nomeEquipe.get(d.responsavel_id) ?? "" : "",
        revisor: d.revisor_id ? nomeEquipe.get(d.revisor_id) ?? "" : "",
        modelo: d.completa === null ? "" : d.completa ? "Completa" : "Simplificada",
        retificadora: d.retificadora ? "Sim" : "Não",
        resultado: d.resultado ? RESULTADO_LABEL[d.resultado] : "",
        pagar: num(d.imposto_pagar),
        restituir: num(d.imposto_restituir),
        quotas: d.quotas,
        recibo: d.numero_recibo ?? "",
        transmitida: d.transmitida_em ? dataBr(d.transmitida_em.slice(0, 10)) : "",
        rendTrib: t?.rendimentosTributaveis ?? null,
        rendIsentos: t?.rendimentosIsentos ?? null,
        rendExcl: t?.rendimentosExclusivos ?? null,
        deducoes: t?.deducoes ?? null,
        impostoDevido: t?.impostoDevido ?? null,
        impostoPago: t?.impostoPago ?? null,
        aliquota: t ? t.aliquotaEfetiva / 100 : null,
        bens: t?.bensAtual ?? null,
        dividas: t?.dividasAtual ?? null,
        honorarioAnterior: num(honorarioAnterior.get(d.contribuinte_id)),
        honorario: num(d.honorario_valor),
        honorarioSituacao: HONORARIO_LABEL[d.honorario_status],
        honorarioNovo: null,
        observacoes: d.observacoes ?? "",
      };
    });

  const wb = planilha(
    `Declarações ${exercicio}`,
    [
      { header: "ID (não alterar)", key: "id", width: 10 },
      { header: "Contribuinte", key: "nome", width: 36 },
      { header: "CPF", key: "cpf", width: 16 },
      { header: "Exercício", key: "exercicio", width: 9 },
      { header: "Situação", key: "situacao", width: 22 },
      { header: "Responsável pela declaração", key: "responsavel", width: 20 },
      { header: "Revisor", key: "revisor", width: 16 },
      { header: "Modelo", key: "modelo", width: 12 },
      { header: "Retificadora", key: "retificadora", width: 9 },
      { header: "Resultado", key: "resultado", width: 11 },
      { header: "A pagar", key: "pagar", width: 13, style: { numFmt: MOEDA } },
      { header: "A restituir", key: "restituir", width: 13, style: { numFmt: MOEDA } },
      { header: "Quotas", key: "quotas", width: 7 },
      { header: "Recibo", key: "recibo", width: 13 },
      { header: "Transmitida em", key: "transmitida", width: 12 },
      { header: "Rend. tributáveis", key: "rendTrib", width: 15, style: { numFmt: MOEDA } },
      { header: "Rend. isentos", key: "rendIsentos", width: 15, style: { numFmt: MOEDA } },
      { header: "Trib. exclusiva", key: "rendExcl", width: 14, style: { numFmt: MOEDA } },
      { header: "Deduções / desconto", key: "deducoes", width: 15, style: { numFmt: MOEDA } },
      { header: "Imposto devido", key: "impostoDevido", width: 14, style: { numFmt: MOEDA } },
      { header: "Imposto pago / retido", key: "impostoPago", width: 14, style: { numFmt: MOEDA } },
      { header: "Alíquota efetiva", key: "aliquota", width: 10, style: { numFmt: "0.00%" } },
      { header: "Bens em 31/12", key: "bens", width: 16, style: { numFmt: MOEDA } },
      { header: "Dívidas em 31/12", key: "dividas", width: 15, style: { numFmt: MOEDA } },
      { header: `Honorário ${exercicio - 1}`, key: "honorarioAnterior", width: 13, style: { numFmt: MOEDA } },
      { header: `Honorário ${exercicio}`, key: "honorario", width: 13, style: { numFmt: MOEDA } },
      { header: "Situação do honorário", key: "honorarioSituacao", width: 14 },
      { header: "Honorário novo (preencher)", key: "honorarioNovo", width: 14, style: { numFmt: MOEDA } },
      { header: "Observações", key: "observacoes", width: 30 },
    ],
    linhas,
  );
  // Destaca a coluna que o Wellington preenche.
  const ws = wb.worksheets[0];
  const col = ws.getColumn("honorarioNovo");
  col.eachCell((cell, n) => {
    if (n > 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
