import "server-only";
import { parseNumeroBr } from "./numero-br";

export type PgdasdImportado = {
  competenciaPA: string; // "YYYY-MM" do período de apuração declarado
  rbt12: number | null;
  folhaMensal: { competencia: string; valor: number }[];
};

// O PGDASD (Programa Gerador do DAS) é gerado pela própria Receita
// Federal com layout fixo — diferente de um PDF escaneado, o texto sai
// limpo e na ordem visual (testado com declaração real). A seção "2.3)
// Folha de Salários Anteriores" já traz exatamente os 12 meses usados
// oficialmente no cálculo do Fator R, então importar daqui é mais
// confiável que qualquer cálculo nosso a partir da folha bruta.
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
    const re = /(\d{2})\/(\d{4})\s+([\d.,]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(folhaSection[0]))) {
      folhaMensal.push({ competencia: `${m[2]}-${m[1]}`, valor: parseNumeroBr(m[3]) });
    }
  }

  if (folhaMensal.length === 0 && rbt12 == null) return null;
  return { competenciaPA, rbt12, folhaMensal };
}
