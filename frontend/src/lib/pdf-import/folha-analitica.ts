import "server-only";
import { parseNumeroBr } from "./numero-br";

export type FolhaAnaliticaImportada = {
  competencia: string; // "YYYY-MM"
  valor: number | null; // Total Geral da Folha
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
export function parseFolhaAnalitica(texto: string): FolhaAnaliticaImportada | null {
  const datas = [...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
  if (datas.length < 2) return null;
  const competencia = `${datas[1][3]}-${datas[1][2]}`;

  const blocoRotulos =
    /Folha\.{5,}:\s*\r?\n?\s*F[ée]rias\.{5,}:\s*\r?\n?\s*Totais das Bases\.{5,}:\s*\r?\n?\s*Rescis[ãa]o\.{5,}:\s*\r?\n?\s*D[ée]cimo Terceiro\.{5,}:([\s\S]*?)Resili[çc][ãa]o\.{5,}:/;
  const m = texto.match(blocoRotulos);
  if (!m) {
    return {
      competencia,
      valor: null,
      fgts: null,
      motivo: "Não reconheci o formato desse PDF de folha.",
    };
  }

  const numeros = [...m[1].matchAll(/-?[\d.]+,\d{2}|\d+/g)].map((x) => x[0]);
  if (numeros.length !== 22) {
    return {
      competencia,
      valor: null,
      fgts: null,
      motivo: "O layout desse PDF parece diferente do esperado — confira e digite os valores.",
    };
  }

  return {
    competencia,
    valor: parseNumeroBr(numeros[20]),
    fgts: parseNumeroBr(numeros[16]),
  };
}
