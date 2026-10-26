// Conferência do fechamento do Simples Nacional ANTES do envio do PGDAS-D.
//
// Funções puras (sem banco, sem "server-only") — recebem os números já
// calculados pela Central Simples (lib/simples-linha.ts) e devolvem um
// veredito por empresa:
//
//   OK        → pode entrar no lote de transmissão direto
//   REVISAR   → só transmite depois que alguém da SOMA aprovar
//               explicitamente (simples_conferencia_aprovacoes), e a
//               aprovação perde a validade se os números mudarem
//   BLOQUEADO → não transmite de jeito nenhum até o problema ser corrigido
//
// As regras vêm da skill de apuração do Simples Nacional (fator R, RBT12,
// sublimite, segregação) mais o que o próprio sistema já sabe conferir
// (Prefeitura de Petrópolis, histórico de receita). Os limites ficam
// exportados como constantes pra ajustar num lugar só.

export type StatusConferencia = "OK" | "REVISAR" | "BLOQUEADO";

export type MotivoConferencia = {
  nivel: Exclude<StatusConferencia, "OK">;
  codigo: string;
  texto: string;
};

export type ResultadoConferencia = {
  status: StatusConferencia;
  motivos: MotivoConferencia[];
};

export const FATOR_R_LIMITE = 0.28;
// Faixa em que uma pequena diferença na folha informada troca o anexo.
export const FATOR_R_BORDA_INFERIOR = 0.25;
export const FATOR_R_BORDA_SUPERIOR = 0.31;
// Receita do mês comparada com a média dos meses anteriores com movimento.
export const VARIACAO_ALTA = 2; // mais que o dobro da média
export const VARIACAO_BAIXA = 0.5; // menos da metade da média
export const MESES_MINIMOS_PARA_MEDIA = 3;
// LC 123/2006 art. 19 (sublimite ICMS/ISS) e art. 3º, II (teto do Simples).
export const SUBLIMITE_ISS = 3_600_000;
export const ALERTA_SUBLIMITE = 0.9;
export const TETO_SIMPLES = 4_800_000;
const IBGE_PETROPOLIS = "3303906";

export type EntradaConferencia = {
  competencia: string; // "YYYY-MM"
  receitaMes: number;
  // Receita de cada um dos 12 meses anteriores que TÊM dado no sistema
  // (nota ou receita manual) — meses sem dado ficam de fora da média.
  receitasMesesAnteriores: number[];
  // Receita bruta acumulada no ano-calendário, incluindo a competência.
  receitaAcumuladaAno: number;
  rbt12: number;
  rbt12Estimado: boolean;
  // Meses de existência da empresa até a competência (null = sem data de
  // abertura cadastrada). Empresa com menos de 12 meses tem RBT12
  // proporcionalizado por lei (CGSN 140/2018 art. 22), não é estimativa.
  mesesDeExistencia: number | null;
  sujeitoFatorR: boolean;
  fatorR: number | null;
  mesesFolhaInformados: number;
  anexo: string;
  // Pendências que já impedem montar o PGDAS-D (atividade sem
  // classificação etc.) — vêm de montarDeclaracaoPgdasD.
  bloqueiosDeclaracao: string[];
  municipioIbge: string | null;
  prefeitura: { valor: number | null; erro: string | null } | null;
  dasBruto: number;
  dasLiquido: number;
};

export function conferirSimples(e: EntradaConferencia): ResultadoConferencia {
  const motivos: MotivoConferencia[] = [];
  const bloquear = (codigo: string, texto: string) => motivos.push({ nivel: "BLOQUEADO", codigo, texto });
  const revisar = (codigo: string, texto: string) => motivos.push({ nivel: "REVISAR", codigo, texto });

  // 1. O que já impede a própria declaração.
  for (const b of e.bloqueiosDeclaracao) bloquear("DECLARACAO", b);

  // 2. Teto e sublimite.
  if (e.rbt12 > TETO_SIMPLES) {
    bloquear(
      "TETO_SIMPLES",
      `RBT12 de ${moeda(e.rbt12)} passa do teto de ${moeda(TETO_SIMPLES)} do Simples Nacional — verificar exclusão do regime.`,
    );
  }
  if (e.receitaAcumuladaAno > SUBLIMITE_ISS) {
    bloquear(
      "SUBLIMITE",
      `Receita acumulada no ano de ${moeda(e.receitaAcumuladaAno)} passou do sublimite de ${moeda(SUBLIMITE_ISS)} — ISS sai do DAS e o cálculo do sistema não cobre isso. Apurar manualmente.`,
    );
  } else if (e.receitaAcumuladaAno > SUBLIMITE_ISS * ALERTA_SUBLIMITE) {
    revisar(
      "SUBLIMITE_PERTO",
      `Receita acumulada no ano de ${moeda(e.receitaAcumuladaAno)} está a menos de 10% do sublimite de ${moeda(SUBLIMITE_ISS)}.`,
    );
  }

  // 3. Fator R.
  if (e.sujeitoFatorR) {
    const mesesEsperados = e.mesesDeExistencia === null ? 12 : Math.min(12, Math.max(0, e.mesesDeExistencia));
    if (e.mesesFolhaInformados === 0 && mesesEsperados > 0) {
      bloquear(
        "FOLHA_AUSENTE",
        "Empresa sujeita ao Fator R sem nenhuma folha informada nos 12 meses — o PGDAS-D iria sem folha (Anexo V). Informe a folha na aba Fator R.",
      );
    } else if (e.mesesFolhaInformados < mesesEsperados) {
      revisar(
        "FOLHA_INCOMPLETA",
        `Folha informada em ${e.mesesFolhaInformados} de ${mesesEsperados} meses — o Fator R está projetado, não real.`,
      );
    }

    if (e.fatorR !== null && e.mesesFolhaInformados > 0) {
      if (e.fatorR >= FATOR_R_BORDA_INFERIOR && e.fatorR < FATOR_R_BORDA_SUPERIOR) {
        revisar(
          "FATOR_R_BORDA",
          `Fator R de ${pct(e.fatorR)} está perto do limite de 28% — uma diferença pequena na folha troca o anexo (${e.anexo}).`,
        );
      } else if (e.fatorR < FATOR_R_LIMITE) {
        revisar(
          "ANEXO_V",
          `Fator R de ${pct(e.fatorR)} → Anexo V. Confirme a folha e avalie ajuste de pró-labore.`,
        );
      }
    }
  }

  // 4. RBT12 estimado — só importa pra empresa com 12+ meses (antes disso
  //    a proporcionalização é a regra legal) e com receita no mês (sem
  //    receita o DAS é zero, o RBT12 não muda nada; "sem receita" já
  //    aparece como motivo próprio logo abaixo).
  const empresaNova = e.mesesDeExistencia !== null && e.mesesDeExistencia < 12;
  if (e.rbt12Estimado && !empresaNova && e.receitaMes > 0) {
    revisar(
      "RBT12_ESTIMADO",
      "RBT12 estimado com histórico incompleto no sistema — importe o PGDAS-D anterior na aba RBT12 ou confira o valor.",
    );
  }

  // 5. Movimento do mês.
  if (e.receitaMes <= 0) {
    revisar(
      "SEM_RECEITA",
      "Nenhuma receita na competência — confirme se é sem movimento (o PGDAS-D vai zerado) ou se faltou buscar/importar notas.",
    );
  } else {
    const comMovimento = e.receitasMesesAnteriores.filter((v) => v > 0);
    if (comMovimento.length >= MESES_MINIMOS_PARA_MEDIA) {
      const media = comMovimento.reduce((a, v) => a + v, 0) / comMovimento.length;
      if (e.receitaMes > media * VARIACAO_ALTA) {
        revisar(
          "VARIACAO_ALTA",
          `Receita do mês (${moeda(e.receitaMes)}) é ${(e.receitaMes / media).toFixed(1).replace(".", ",")}× a média dos meses anteriores (${moeda(media)}) — confira nota duplicada ou de outra competência.`,
        );
      } else if (e.receitaMes < media * VARIACAO_BAIXA) {
        revisar(
          "VARIACAO_BAIXA",
          `Receita do mês (${moeda(e.receitaMes)}) é menos da metade da média dos meses anteriores (${moeda(media)}) — pode estar faltando nota.`,
        );
      }
    }
  }

  // 6. Prefeitura (hoje só Petrópolis tem conferência automática).
  if (e.municipioIbge === IBGE_PETROPOLIS) {
    if (!e.prefeitura) {
      revisar("PREFEITURA_NAO_CONFERIDA", "Faturamento ainda não conferido com a Prefeitura de Petrópolis — rode \"Conferir prefeitura\".");
    } else if (e.prefeitura.valor === null) {
      revisar(
        "PREFEITURA_SEM_ACESSO",
        `Não foi possível consultar a Prefeitura${e.prefeitura.erro ? `: ${e.prefeitura.erro}` : ""}.`,
      );
    } else if (Math.abs(e.prefeitura.valor - e.receitaMes) >= 0.01) {
      revisar(
        "PREFEITURA_DIVERGENTE",
        `Prefeitura mostra ${moeda(e.prefeitura.valor)} e o sistema tem ${moeda(e.receitaMes)} (diferença de ${moeda(e.prefeitura.valor - e.receitaMes)}).`,
      );
    }
  }

  // 7. Retenção zerando o DAS.
  if (e.dasBruto > 0 && e.dasLiquido <= 0) {
    revisar("RETENCAO_ZEROU_DAS", "As retenções sofridas zeraram o DAS — confira as notas com retenção.");
  }

  const status: StatusConferencia = motivos.some((m) => m.nivel === "BLOQUEADO")
    ? "BLOQUEADO"
    : motivos.length > 0
      ? "REVISAR"
      : "OK";
  return { status, motivos };
}

// "Impressão digital" dos números que foram aprovados. Uma aprovação só
// vale enquanto a assinatura atual for idêntica à gravada — se entrar nota
// nova, mudar a folha ou o RBT12 depois da aprovação, a empresa volta pra
// REVISAR sozinha em vez de transmitir um valor que ninguém viu.
export function assinaturaConferencia(e: EntradaConferencia, resultado: ResultadoConferencia): string {
  return JSON.stringify({
    c: e.competencia,
    r: centavos(e.receitaMes),
    b: centavos(e.rbt12),
    a: e.anexo,
    f: e.fatorR === null ? null : Math.round(e.fatorR * 10_000),
    d: centavos(e.dasLiquido),
    m: resultado.motivos.map((m) => m.codigo).sort(),
  });
}

export function liberadoParaEnvio(
  resultado: ResultadoConferencia,
  assinaturaAtual: string,
  aprovacao: { assinatura: string } | null,
): boolean {
  if (resultado.status === "OK") return true;
  if (resultado.status === "BLOQUEADO") return false;
  return aprovacao !== null && aprovacao.assinatura === assinaturaAtual;
}

function centavos(v: number) {
  return Math.round(v * 100);
}

function moeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number) {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}
