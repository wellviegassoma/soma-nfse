import "server-only";
import { proximaCompetencia } from "@/lib/competencia";
import { parseNumeroBr } from "./numero-br";

export type FolhaAnaliticaImportada = {
  competenciaProLabore: string; // "YYYY-MM" — mesmo mês da folha
  competenciaSalariosFgts: string; // "YYYY-MM" — mês seguinte (pago/recolhido depois)
  proLabore: number | null;
  salarios: number | null;
  fgts: number | null; // Total FGTS (Informações adicionais)
  motivo?: string; // preenchido quando os valores não puderam ser extraídos com confiança
};

// Diferente do PGDASD (layout fixo da Receita Federal), esse relatório é
// gerado pelo sistema de folha da SOMA e o extrator de texto do PDF não
// preserva a ordem visual da tabela "Resumo das Bases" — os números saem
// fora de ordem (coluna a coluna, não linha a linha). Testado com
// arquivo real: o bloco entre os rótulos fixos (Folha/Férias/Totais das
// Bases/Rescisão/Décimo Terceiro) e "Resilição" sempre tem exatamente 22
// números nessa ordem — 5 colunas de base (FGTS/INSS/IRRF) + 5 totais
// da seção "Informações adicionais" e "Resumo da Folha" (nessa ordem:
// IRRF/FGTS/INSS/Líquido/Descontos) + Total Geral da Folha + Total de
// Funcionários. Se a contagem não bater com 22, é sinal de que o layout
// mudou — melhor pedir preenchimento manual do que arriscar um número
// errado indo pro Fator R.
//
// Pró-labore some do "Total Geral da Folha" por subtração — diferente do
// resto da tabela (Resumo das Bases), a lista de funcionários lê em
// ordem visual normal, então o rótulo "PRO LABORE" aparece colado no
// valor de cada sócio (testado com arquivo real).
export function parseFolhaAnalitica(texto: string): FolhaAnaliticaImportada | null {
  const datas = [...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (datas.length < 2) return null;
  const competenciaProLabore = `${datas[1][3]}-${datas[1][2]}`;
  const competenciaSalariosFgts = proximaCompetencia(competenciaProLabore);

  const blocoRotulos =
    /Folha\.{5,}:\s*\r?\n?\s*F[ée]rias\.{5,}:\s*\r?\n?\s*Totais das Bases\.{5,}:\s*\r?\n?\s*Rescis[ãa]o\.{5,}:\s*\r?\n?\s*D[ée]cimo Terceiro\.{5,}:([\s\S]*?)Resili[çc][ãa]o\.{5,}:/;
  const m = texto.match(blocoRotulos);
  if (!m) {
    return {
      competenciaProLabore,
      competenciaSalariosFgts,
      proLabore: null,
      salarios: null,
      fgts: null,
      motivo: "Não reconheci o formato desse PDF de folha.",
    };
  }

  const numeros = [...m[1].matchAll(/-?[\d.]+,\d{2}|\d+/g)].map((x) => x[0]);
  if (numeros.length !== 22) {
    return {
      competenciaProLabore,
      competenciaSalariosFgts,
      proLabore: null,
      salarios: null,
      fgts: null,
      motivo: "O layout desse PDF parece diferente do esperado — confira e digite os valores.",
    };
  }

  const totalGeralFolha = parseNumeroBr(numeros[20]);
  const fgts = parseNumeroBr(numeros[16]);

  const proLaboreMatches = [...texto.matchAll(/PR[OÓ][\s-]?LABORE\s+([\d.,]+)/gi)];
  const proLabore = proLaboreMatches.reduce((acc, mm) => acc + parseNumeroBr(mm[1]), 0);
  const salarios = Math.round((totalGeralFolha - proLabore) * 100) / 100;

  return { competenciaProLabore, competenciaSalariosFgts, proLabore, salarios, fgts };
}
