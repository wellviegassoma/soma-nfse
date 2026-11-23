// Análise da declaração para o cliente e para a equipe: evolução ano a ano,
// conciliação patrimonial do ano, composição dos bens, deduções por
// categoria e destaques automáticos. Função pura sobre os resumos gravados
// (lidos do .DEC/PDF), sem consultar nada.
import { descricaoPagamento, type ResumoGravado } from "./comum";

export type AnoResumo = { exercicio: number; resumo: ResumoGravado };

// Grupos de bens da ficha Bens e Direitos (leiaute a partir de 2024). Antes
// de 2024 só havia o código de 2 dígitos — o grupo é a dezena dele.
const GRUPOS: Record<string, string> = {
  "01": "Imóveis",
  "02": "Veículos e bens móveis",
  "03": "Participações societárias",
  "04": "Aplicações e investimentos",
  "05": "Créditos a receber",
  "06": "Contas e dinheiro",
  "07": "Fundos",
  "08": "Criptoativos",
  "99": "Outros bens",
};
const GRUPO_ANTIGO: Record<string, string> = {
  "1": "01", "2": "02", "3": "03", "4": "04", "5": "05", "6": "06", "7": "07", "8": "08", "9": "99",
};

export function grupoDoBem(b: { grupo: string | null; codigo: string }): string {
  if (b.grupo && GRUPOS[b.grupo]) return b.grupo;
  return GRUPO_ANTIGO[(b.codigo || "9").padStart(2, "0")[0]] ?? "99";
}
export const rotuloGrupo = (g: string) => GRUPOS[g] ?? "Outros bens";

// Categorias de dedução pelos códigos da ficha Pagamentos Efetuados.
const CATEGORIA_PAGAMENTO: [RegExp, string][] = [
  [/^0[12]$/, "Educação"],
  [/^(09|1[0-9]|2[0-9])$/, "Saúde"],
  [/^3[0-3]$/, "Pensão alimentícia"],
  [/^3[67]$/, "Previdência complementar"],
  [/^4[0-9]$/, "Doações"],
];
/** Categoria da dedução, ou null quando o pagamento é só informativo (aluguel, arrendamento…). */
export function categoriaPagamento(codigo: string): string | null {
  return CATEGORIA_PAGAMENTO.find(([re]) => re.test(codigo))?.[1] ?? null;
}

export type Destaque = { tom: "bom" | "atencao" | "info"; titulo: string; texto: string };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function analisar(anos: AnoResumo[], exercicio: number) {
  const ordenados = [...anos].sort((a, b) => a.exercicio - b.exercicio);
  const atualAno = ordenados.find((a) => a.exercicio === exercicio)!;
  const atual = atualAno.resumo;
  const anteriorAno = [...ordenados].reverse().find((a) => a.exercicio < exercicio) ?? null;
  const anterior = anteriorAno?.resumo ?? null;
  const t = atual.totais;

  const rendaTotal = (r: ResumoGravado) =>
    r.totais.rendimentosTributaveis + r.totais.rendimentosIsentos + r.totais.rendimentosExclusivos;
  const pl = (bens: number, dividas: number) => bens - dividas;

  // Série histórica (até 5 anos).
  const serie = ordenados
    .filter((a) => a.exercicio <= exercicio)
    .slice(-5)
    .map((a) => ({
      exercicio: a.exercicio,
      anoCalendario: a.exercicio - 1,
      rendaTributavel: a.resumo.totais.rendimentosTributaveis,
      rendaTotal: rendaTotal(a.resumo),
      impostoDevido: a.resumo.totais.impostoDevido,
      aliquota: a.resumo.totais.aliquotaEfetiva,
      bens: a.resumo.totais.bensAtual,
      dividas: a.resumo.totais.dividasAtual,
      patrimonio: pl(a.resumo.totais.bensAtual, a.resumo.totais.dividasAtual),
      parcial: !!a.resumo.parcial,
    }));

  // Conciliação patrimonial do ano (da própria declaração: 31/12 anterior × atual).
  const plInicio = pl(t.bensAnterior, t.dividasAnterior);
  const plFim = pl(t.bensAtual, t.dividasAtual);
  const variacao = plFim - plInicio;
  const rendaDisponivel = rendaTotal(atual) - t.impostoDevido;
  const gastosEstimados = rendaDisponivel - variacao; // o que sobrou da renda e não virou patrimônio
  const descoberto = gastosEstimados < 0 ? -gastosEstimados : 0;

  // Composição por grupo (início × fim do ano).
  const composicaoMap = new Map<string, { anterior: number; atual: number }>();
  for (const b of atual.bens) {
    const g = grupoDoBem(b);
    const c = composicaoMap.get(g) ?? { anterior: 0, atual: 0 };
    c.anterior += b.valorAnterior;
    c.atual += b.valorAtual;
    composicaoMap.set(g, c);
  }
  const composicao = [...composicaoMap.entries()]
    .map(([grupo, v]) => ({ grupo, rotulo: rotuloGrupo(grupo), ...v }))
    .filter((c) => c.atual > 0 || c.anterior > 0)
    .sort((a, b) => b.atual - a.atual);

  // Movimentações relevantes de bens.
  const adquiridos = atual.bens.filter((b) => b.valorAnterior === 0 && b.valorAtual > 0).sort((a, b) => b.valorAtual - a.valorAtual);
  const baixados = atual.bens.filter((b) => b.valorAnterior > 0 && b.valorAtual === 0).sort((a, b) => b.valorAnterior - a.valorAnterior);

  // Fontes de renda (PJ) com participação.
  const somaFontes = atual.fontes.reduce((s, f) => s + f.rendimento, 0);
  const fontes = [...atual.fontes]
    .sort((a, b) => b.rendimento - a.rendimento)
    .map((f) => ({ ...f, participacao: somaFontes > 0 ? (f.rendimento / somaFontes) * 100 : 0 }));
  const outrosTributaveis = Math.max(0, t.rendimentosTributaveis - somaFontes);

  // Deduções por categoria (atual × anterior).
  const deducoesPor = (r: ResumoGravado | null) => {
    const m = new Map<string, number>();
    if (!r) return m;
    for (const p of r.pagamentos) {
      const v = p.valor - p.parcelaNaoDedutivel;
      if (v <= 0) continue;
      const c = categoriaPagamento(p.codigo);
      if (!c) continue; // informativo, não dedutível
      m.set(c, (m.get(c) ?? 0) + v);
    }
    if (r.totais.previdenciaOficial > 0) m.set("Previdência oficial (INSS)", r.totais.previdenciaOficial);
    if (r.totais.dependentes > 0) m.set("Dependentes", r.totais.dependentes);
    if (r.totais.livroCaixa > 0) m.set("Livro-caixa", r.totais.livroCaixa);
    return m;
  };
  const dedAtual = deducoesPor(atual);
  const dedAnterior = deducoesPor(anterior);
  const deducoes = [...new Set([...dedAtual.keys(), ...dedAnterior.keys()])]
    .map((categoria) => ({ categoria, atual: dedAtual.get(categoria) ?? 0, anterior: anterior ? dedAnterior.get(categoria) ?? 0 : null }))
    .sort((a, b) => b.atual - a.atual);
  const maioresPagamentos = [...atual.pagamentos]
    .filter((p) => categoriaPagamento(p.codigo))
    .map((p) => ({ ...p, dedutivel: p.valor - p.parcelaNaoDedutivel, tipo: descricaoPagamento(p.codigo) }))
    .filter((p) => p.dedutivel > 0)
    .sort((a, b) => b.dedutivel - a.dedutivel);
  // Pagamentos só informativos (aluguel pago, arrendamento…): aparecem à parte.
  const pagamentosInformativos = atual.pagamentos
    .filter((p) => !categoriaPagamento(p.codigo) && p.valor > 0)
    .map((p) => ({ ...p, tipo: descricaoPagamento(p.codigo) }))
    .sort((a, b) => b.valor - a.valor);

  // Destaques automáticos.
  const destaques: Destaque[] = [];
  if (!atual.parcial) {
    if (descoberto > 1) {
      destaques.push({
        tom: "atencao",
        titulo: "Patrimônio cresceu mais que a renda declarada",
        texto: `O patrimônio líquido aumentou ${brl(variacao)}, ${brl(descoberto)} a mais do que a renda disponível do ano (${brl(
          rendaDisponivel,
        )}). Antes de transmitir, confira se ficou de fora algum rendimento, empréstimo, venda de bem ou doação recebida — é o principal motivo de malha fina.`,
      });
    } else if (variacao !== 0) {
      destaques.push({
        tom: "bom",
        titulo: variacao > 0 ? "Evolução patrimonial compatível com a renda" : "Patrimônio reduziu no ano",
        texto:
          variacao > 0
            ? `Seu patrimônio líquido cresceu ${brl(variacao)}${plInicio > 0 ? ` (${pct((variacao / plInicio) * 100)})` : ""}, dentro do que a sua renda do ano permite.`
            : `Seu patrimônio líquido diminuiu ${brl(-variacao)} no ano — normal quando há despesas grandes, quitação de dívidas ou venda de bens.`,
      });
    }
  }
  if (anterior && !anterior.parcial && !atual.parcial) {
    const da = t.aliquotaEfetiva - anterior.totais.aliquotaEfetiva;
    if (Math.abs(da) >= 0.5) {
      destaques.push({
        tom: da < 0 ? "bom" : "info",
        titulo: da < 0 ? "Sua carga de imposto caiu" : "Sua carga de imposto subiu",
        texto: `A alíquota efetiva foi de ${pct(t.aliquotaEfetiva)}, contra ${pct(anterior.totais.aliquotaEfetiva)} no ano anterior.${
          da > 0 ? " Vale conversar sobre planejamento para o próximo ano." : ""
        }`,
      });
    }
    const dr = rendaTotal(atual) - rendaTotal(anterior);
    if (rendaTotal(anterior) > 0 && Math.abs(dr / rendaTotal(anterior)) >= 0.1) {
      destaques.push({
        tom: "info",
        titulo: dr > 0 ? "Sua renda cresceu" : "Sua renda diminuiu",
        texto: `Rendimentos totais de ${brl(rendaTotal(atual))}, ${dr > 0 ? "alta" : "queda"} de ${pct(Math.abs(dr / rendaTotal(anterior)) * 100)} sobre o ano anterior.`,
      });
    }
  }
  // Oportunidade de previdência PGBL (dedutível até 12% da renda tributável, só na completa).
  if (atual.completa && !atual.parcial && t.rendimentosTributaveis > 0) {
    const limite = t.rendimentosTributaveis * 0.12;
    const pgbl = atual.pagamentos.filter((p) => p.codigo === "36").reduce((s, p) => s + p.valor - p.parcelaNaoDedutivel, 0);
    const folga = limite - pgbl;
    if (folga > 2000) {
      destaques.push({
        tom: "info",
        titulo: "Oportunidade: previdência PGBL",
        texto: `Na declaração completa, aportes em PGBL podem ser deduzidos até 12% da renda tributável (${brl(limite)}). ${
          pgbl > 0 ? `Você deduziu ${brl(pgbl)}.` : "Você não tem aportes."
        } Até ${brl(folga)} a mais poderiam reduzir o imposto em até ${brl(folga * 0.275)} — avalie com a gente antes de dezembro.`,
      });
    }
  }
  if (adquiridos.length || baixados.length) {
    destaques.push({
      tom: "info",
      titulo: "Movimentação de bens no ano",
      texto: [
        adquiridos.length ? `${adquiridos.length} bem(ns) novo(s) (${brl(adquiridos.reduce((s, b) => s + b.valorAtual, 0))})` : null,
        baixados.length ? `${baixados.length} bem(ns) baixado(s) ou vendido(s) (${brl(baixados.reduce((s, b) => s + b.valorAnterior, 0))} no ano anterior)` : null,
      ]
        .filter(Boolean)
        .join(" e ")
        .concat(". Confira se a lista abaixo está completa."),
    });
  }

  return {
    exercicio,
    anterior: anteriorAno ? { exercicio: anteriorAno.exercicio, resumo: anterior! } : null,
    serie,
    rendaTotal: rendaTotal(atual),
    plInicio,
    plFim,
    variacao,
    rendaDisponivel,
    gastosEstimados,
    descoberto,
    composicao,
    adquiridos,
    baixados,
    fontes,
    outrosTributaveis,
    deducoes,
    maioresPagamentos,
    pagamentosInformativos,
    destaques,
  };
}

export type Analise = ReturnType<typeof analisar>;
