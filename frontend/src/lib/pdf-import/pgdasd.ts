import "server-only";
import { parseNumeroBr } from "./numero-br";

export type PgdasdImportado = {
  competenciaPA: string; // "YYYY-MM" do período de apuração declarado
  rbt12: number | null;
  folhaMensal: { competencia: string; valor: number }[];
  receitaMensal: { competencia: string; valor: number }[];
};

// Extrai pares "MM/AAAA valor" de um trecho de texto — layout comum às
// tabelas de meses anteriores do PGDAS-D (receita e folha).
function extrairParesMesValor(trecho: string): Map<string, number> {
  const mapa = new Map<string, number>();
  const re = /(\d{2})\/(\d{4})\s+([\d.,]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(trecho))) {
    mapa.set(`${m[2]}-${m[1]}`, parseNumeroBr(m[3]));
  }
  return mapa;
}

// O PGDASD (Programa Gerador do DAS) é gerado pela própria Receita
// Federal com layout fixo — diferente de um PDF escaneado, o texto sai
// limpo e na ordem visual (testado com declaração real). As seções
// "2.2) Receitas Brutas Anteriores" e "2.3) Folha de Salários
// Anteriores" já trazem os meses anteriores oficiais (receita e folha,
// respectivamente), então importar daqui é mais confiável que qualquer
// cálculo nosso a partir de outra fonte — inclusive mais confiável que
// o próprio sync do Sefin Nacional pra competências anteriores a
// dezembro/2025, quando a distribuição de notas ainda era parcial.
export function parsePgdasd(texto: string): PgdasdImportado | null {
  const periodo = texto.match(
    /Per[íi]odo de Apura[çc][ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})\s*a\s*(\d{2})\/(\d{2})\/(\d{4})/,
  );
  if (!periodo) return null;
  const competenciaPA = `${periodo[3]}-${periodo[2]}`;

  const rbt12Match = texto.match(
    /Receita bruta acumulada nos doze meses anteriores\s*\r?\n?ao PA \(RBT12\)\s*([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)/,
  );
  const rbt12 = rbt12Match ? parseNumeroBr(rbt12Match[3]) : null;

  const folhaSection = texto.match(
    /2\.3\)\s*Folha de Sal[áa]rios Anteriores[\s\S]*?(?=2\.3\.1\))/,
  );
  const folhaMensal: { competencia: string; valor: number }[] = [];
  if (folhaSection) {
    for (const [competencia, valor] of extrairParesMesValor(folhaSection[0])) {
      folhaMensal.push({ competencia, valor });
    }
  }

  // "2.2) Receitas Brutas Anteriores" tem duas subseções com os mesmos
  // meses (Mercado Interno e Mercado Externo) — soma as duas por
  // competência pra chegar na receita bruta total de cada mês.
  const receitaSection = texto.match(
    /2\.2\.1\)\s*Mercado Interno([\s\S]*?)2\.2\.2\)\s*Mercado Externo([\s\S]*?)(?=2\.3\))/,
  );
  const receitaMensal: { competencia: string; valor: number }[] = [];
  if (receitaSection) {
    const interno = extrairParesMesValor(receitaSection[1]);
    const externo = extrairParesMesValor(receitaSection[2]);
    for (const [competencia, valor] of interno) {
      receitaMensal.push({ competencia, valor: valor + (externo.get(competencia) ?? 0) });
    }
  }

  if (folhaMensal.length === 0 && receitaMensal.length === 0 && rbt12 == null) return null;
  return { competenciaPA, rbt12, folhaMensal, receitaMensal };
}
