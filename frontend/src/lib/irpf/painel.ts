import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { listarEquipe } from "@/lib/tarefas";
import { ETAPAS_QUADRO, prazoEntrega, type HonorarioStatus, type StatusDeclaracao } from "./comum";

// Indicadores do painel do IRPF (página inicial do módulo). Tudo calculado
// a partir das declarações do exercício e do anterior — sem tabela nova.

/** Dias sem mexer para uma declaração em andamento contar como "parada". */
export const DIAS_PARADA = 7;
/** Dias esperando o cliente para entrar na fila de cobrança. */
export const DIAS_CLIENTE = 5;

const EM_ANDAMENTO: StatusDeclaracao[] = [
  "AGUARDANDO_DOCUMENTOS",
  "DOCUMENTOS_RECEBIDOS",
  "EM_ELABORACAO",
  "EM_REVISAO",
  "AGUARDANDO_APROVACAO",
  "APROVADA",
];
const COM_CLIENTE: StatusDeclaracao[] = ["AGUARDANDO_DOCUMENTOS", "AGUARDANDO_APROVACAO"];

type Decl = {
  id: string;
  contribuinte_id: string;
  status: StatusDeclaracao;
  responsavel_id: string | null;
  resultado: "SEM_SALDO" | "PAGAR" | "RESTITUIR" | null;
  imposto_pagar: number | null;
  imposto_restituir: number | null;
  quotas: number | null;
  transmitida_em: string | null;
  honorario_valor: number | null;
  honorario_status: HonorarioStatus;
  honorario_vencimento: string | null;
  updated_at: string;
  irpf_contribuintes: { nome: string } | null;
};

export type ItemFila = { id: string; nome: string; responsavel: string; dias: number; detalhe?: string };

export type Painel = Awaited<ReturnType<typeof montarPainel>>;

const DIA = 86_400_000;
const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

/** Dias úteis (seg-sex) de hoje (inclusive) até a data (inclusive). Feriados não entram. */
function diasUteisAte(dataIso: string, hoje: string): number {
  let n = 0;
  for (let t = Date.parse(`${hoje}T12:00:00Z`); t <= Date.parse(`${dataIso}T12:00:00Z`); t += DIA) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) n++;
  }
  return n;
}

/** Segunda-feira da semana da data (AAAA-MM-DD). */
function semana(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export async function montarPainel(supabase: SupabaseClient, exercicio: number) {
  const hoje = hojeSP();
  const agora = Date.now();

  const [decls, anteriores, ativos, equipe] = await Promise.all([
    buscarTudoPaginado<Decl>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select(
          "id, contribuinte_id, status, responsavel_id, resultado, imposto_pagar, imposto_restituir, quotas, transmitida_em, honorario_valor, honorario_status, honorario_vencimento, updated_at, irpf_contribuintes(nome)",
        )
        .eq("exercicio", exercicio)
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: Decl[] | null; error: { message: string } | null }>,
    ),
    buscarTudoPaginado<{ contribuinte_id: string; status: string; transmitida_em: string | null }>((from, to) =>
      supabase
        .from("irpf_declaracoes")
        .select("contribuinte_id, status, transmitida_em")
        .eq("exercicio", exercicio - 1)
        .order("id")
        .range(from, to),
    ),
    buscarTudoPaginado<{ id: string }>((from, to) =>
      supabase.from("irpf_contribuintes").select("id").eq("ativo", true).order("id").range(from, to),
    ),
    listarEquipe(),
  ]);
  const nomeEquipe = new Map(equipe.map((e) => [e.id, e.nome]));
  const respDe = (d: Decl) => (d.responsavel_id ? nomeEquipe.get(d.responsavel_id) ?? "—" : "Sem responsável");
  const nomeDe = (d: Decl) => d.irpf_contribuintes?.nome ?? "—";

  // Última movimentação = maior entre a declaração e o checklist dela.
  const ids = decls.map((d) => d.id);
  const itens = ids.length
    ? await buscarTudoPaginado<{ declaracao_id: string; status: string; updated_at: string }>((from, to) =>
        supabase
          .from("irpf_checklist_itens")
          .select("declaracao_id, status, updated_at")
          .in("declaracao_id", ids)
          .order("id")
          .range(from, to),
      )
    : [];
  const ultima = new Map(decls.map((d) => [d.id, Date.parse(d.updated_at)]));
  const pendentesChecklist = new Map<string, number>();
  for (const it of itens) {
    ultima.set(it.declaracao_id, Math.max(ultima.get(it.declaracao_id) ?? 0, Date.parse(it.updated_at)));
    if (it.status === "PENDENTE") pendentesChecklist.set(it.declaracao_id, (pendentesChecklist.get(it.declaracao_id) ?? 0) + 1);
  }
  const diasParado = (d: Decl) => Math.floor((agora - (ultima.get(d.id) ?? agora)) / DIA);

  const validas = decls.filter((d) => d.status !== "NAO_FARA");
  const transmitidas = validas.filter((d) => d.status === "TRANSMITIDA");
  const abertas = validas.filter((d) => d.status !== "TRANSMITIDA");
  const emAndamento = validas.filter((d) => EM_ANDAMENTO.includes(d.status));
  const paradas = emAndamento.filter((d) => diasParado(d) >= DIAS_PARADA);

  // Prazo e ritmo.
  const prazo = prazoEntrega(exercicio);
  const diasCorridos = Math.ceil((Date.parse(`${prazo}T23:59:59-03:00`) - agora) / DIA);
  const diasUteis = diasCorridos >= 0 ? diasUteisAte(prazo, hoje) : 0;
  const ritmoNecessario = diasUteis > 0 ? abertas.length / diasUteis : null;
  const seteDias = agora - 7 * DIA;
  const ultimos7 = transmitidas.filter((d) => d.transmitida_em && Date.parse(d.transmitida_em) >= seteDias).length;

  // Mesmo dia do ano passado: quantas o escritório já tinha entregue.
  const mesmoDiaAnoPassado = Date.parse(`${exercicio - 1}${hoje.slice(4)}T23:59:59-03:00`);
  const anteriorValidas = anteriores.filter((a) => a.status !== "NAO_FARA");
  const anteriorAteHoje = anteriorValidas.filter((a) => a.transmitida_em && Date.parse(a.transmitida_em) <= mesmoDiaAnoPassado).length;

  // Quem fez no ano passado e ainda não tem declaração este ano.
  const temAgora = new Set(decls.map((d) => d.contribuinte_id));
  const ativosSet = new Set(ativos.map((a) => a.id));
  const semDeclaracao = ativos.filter((a) => !temAgora.has(a.id)).length;
  const doAnoPassadoSemAgora = new Set(anteriorValidas.map((a) => a.contribuinte_id).filter((c) => !temAgora.has(c) && ativosSet.has(c))).size;

  // Funil.
  const porEtapa = ETAPAS_QUADRO.map((s) => ({ status: s, n: decls.filter((d) => d.status === s).length }));
  const naoFara = decls.length - validas.length;

  // Honorários.
  const val = (d: Decl) => Number(d.honorario_valor ?? 0);
  const aReceber = (d: Decl) => (d.honorario_status === "A_COBRAR" || d.honorario_status === "COBRADO") && val(d) > 0;
  const vencido = (d: Decl) => aReceber(d) && !!d.honorario_vencimento && d.honorario_vencimento < hoje;
  const soma = (ls: Decl[], f: (d: Decl) => boolean) => ls.filter(f).reduce((s, d) => s + val(d), 0);
  const honorarios = {
    previsto: soma(validas, (d) => d.honorario_status !== "ISENTO"),
    recebido: soma(validas, (d) => d.honorario_status === "PAGO"),
    aReceber: soma(validas, aReceber),
    vencido: soma(validas, vencido),
    semValor: validas.filter((d) => d.honorario_valor === null && d.honorario_status !== "ISENTO").length,
    // Entregue e ainda não pago: o momento certo de cobrar.
    entregueSemPagar: soma(transmitidas, aReceber),
    entregueSemPagarN: transmitidas.filter(aReceber).length,
  };

  // Resultado da carteira (o que os clientes vão pagar/receber).
  const carteira = {
    restituir: validas.filter((d) => d.resultado === "RESTITUIR"),
    pagar: validas.filter((d) => d.resultado === "PAGAR"),
    semSaldo: validas.filter((d) => d.resultado === "SEM_SALDO").length,
    semArquivo: validas.filter((d) => d.resultado === null).length,
  };

  // Carga por responsável.
  const grupos = new Map<string, Decl[]>();
  for (const d of validas) grupos.set(respDe(d), [...(grupos.get(respDe(d)) ?? []), d]);
  const porResponsavel = [...grupos.entries()]
    .map(([nome, ls]) => ({
      nome,
      total: ls.length,
      abertas: ls.filter((d) => d.status !== "TRANSMITIDA").length,
      transmitidas: ls.filter((d) => d.status === "TRANSMITIDA").length,
      paradas: ls.filter((d) => EM_ANDAMENTO.includes(d.status) && diasParado(d) >= DIAS_PARADA).length,
      aReceber: soma(ls, aReceber),
      responsavelId: ls[0]?.responsavel_id ?? null,
    }))
    .sort((a, b) => b.abertas - a.abertas);

  // Filas de ação (o que fazer hoje), mais antigas primeiro.
  const fila = (ls: Decl[], detalhe?: (d: Decl) => string | undefined): ItemFila[] =>
    ls
      .map((d) => ({ id: d.id, nome: nomeDe(d), responsavel: respDe(d), dias: diasParado(d), detalhe: detalhe?.(d) }))
      .sort((a, b) => b.dias - a.dias);
  const filas = {
    transmitir: fila(validas.filter((d) => d.status === "APROVADA")),
    revisar: fila(validas.filter((d) => d.status === "EM_REVISAO")),
    comecar: fila(validas.filter((d) => d.status === "DOCUMENTOS_RECEBIDOS")),
    cobrarCliente: fila(
      validas.filter((d) => COM_CLIENTE.includes(d.status) && diasParado(d) >= DIAS_CLIENTE),
      (d) => {
        const p = pendentesChecklist.get(d.id);
        return d.status === "AGUARDANDO_APROVACAO" ? "aprovação" : p ? `${p} doc. pendente(s)` : "documentos";
      },
    ),
    honorarioVencido: fila(validas.filter(vencido), (d) => `R$ ${val(d).toFixed(2).replace(".", ",")}`),
  };

  // Entregas por semana (últimas 10 semanas).
  const semanas: { semana: string; n: number }[] = [];
  for (let i = 9; i >= 0; i--) semanas.push({ semana: semana(new Date(agora - i * 7 * DIA).toISOString()), n: 0 });
  for (const d of transmitidas) {
    if (!d.transmitida_em) continue;
    const s = semanas.find((x) => x.semana === semana(d.transmitida_em!));
    if (s) s.n++;
  }

  return {
    exercicio,
    hoje,
    total: validas.length,
    naoFara,
    transmitidas: transmitidas.length,
    abertas: abertas.length,
    ativos: ativos.length,
    semDeclaracao,
    doAnoPassadoSemAgora,
    prazo,
    diasCorridos,
    diasUteis,
    ritmoNecessario,
    ultimos7,
    anteriorTotal: anteriorValidas.length,
    anteriorAteHoje,
    paradas: paradas.length,
    porEtapa,
    honorarios,
    carteira: {
      restituirN: carteira.restituir.length,
      restituirTotal: carteira.restituir.reduce((s, d) => s + Number(d.imposto_restituir ?? 0), 0),
      pagarN: carteira.pagar.length,
      pagarTotal: carteira.pagar.reduce((s, d) => s + Number(d.imposto_pagar ?? 0), 0),
      parceladas: carteira.pagar.filter((d) => (d.quotas ?? 0) > 1).length,
      semSaldo: carteira.semSaldo,
      semArquivo: carteira.semArquivo,
    },
    porResponsavel,
    filas,
    semanas,
  };
}
