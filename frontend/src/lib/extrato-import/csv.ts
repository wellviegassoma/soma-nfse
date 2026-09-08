import "server-only";
import type { LinhaOfx } from "./ofx";

/**
 * Parser de extrato em CSV/planilha. Segundo caminho de importação, pra banco
 * que não exporta OFX ou pro cliente que só tem a planilha.
 *
 * Sem mapeamento de colunas configurável nesta rodada: detecta o cabeçalho
 * pelos nomes usuais dos bancos brasileiros. Quando não reconhece, falha
 * dizendo quais colunas achou — melhor do que importar tudo errado em silêncio.
 */

export type ResultadoCsv = {
  linhas: LinhaOfx[];
  erro?: string;
  colunasEncontradas?: string[];
};

const ALIASES_DATA = ["data", "data lancamento", "data movimento", "dt", "data da movimentacao"];
const ALIASES_DESCRICAO = [
  "descricao", "historico", "lancamento", "memo", "detalhes", "descricao movimento",
];
const ALIASES_VALOR = ["valor", "valor r$", "montante", "vlr", "valor lancamento"];
const ALIASES_DOCUMENTO = ["documento", "doc", "numero documento", "nr documento", "num doc"];
// Alguns extratos separam entrada e saída em duas colunas em vez de usar sinal.
const ALIASES_CREDITO = ["credito", "entrada", "creditos"];
const ALIASES_DEBITO = ["debito", "saida", "debitos"];

/**
 * Converte decidindo qual é o separador decimal, em vez de assumir formato
 * brasileiro. Extrato exportado por sistema internacional vem "2500.00", e
 * tratar o ponto como milhar viraria 250.000 — erro de 100x que passaria
 * despercebido numa conciliação.
 *
 * Regra: com vírgula E ponto, o ÚLTIMO a aparecer é o decimal. Só vírgula, ela
 * é o decimal. Só ponto, é decimal quando aparece uma vez com 1 ou 2 dígitos
 * depois (senão é separador de milhar, como em "1.234").
 */
function paraNumero(t: string): number {
  const temVirgula = t.includes(",");
  const temPonto = t.includes(".");

  let normalizado: string;
  if (temVirgula && temPonto) {
    normalizado =
      t.lastIndexOf(",") > t.lastIndexOf(".")
        ? t.replace(/\./g, "").replace(",", ".")
        : t.replace(/,/g, "");
  } else if (temVirgula) {
    normalizado = t.replace(",", ".");
  } else if (temPonto) {
    const partes = t.split(".");
    const ehDecimal = partes.length === 2 && partes[1].length >= 1 && partes[1].length <= 2;
    normalizado = ehDecimal ? t : t.replace(/\./g, "");
  } else {
    normalizado = t;
  }

  return Number(normalizado);
}

/**
 * Limpa o valor antes de converter: extrato traz "R$ 1.234,56", "1.234,56 D"
 * (marcador de débito), "(50,00)" pra negativo, e espaço não-quebrável do
 * Excel. Converter direto devolveria NaN em todos esses.
 */
function parseValorCelula(bruto: string): number {
  if (!bruto) return NaN;
  const t = bruto.replace(/ /g, " ").trim();

  const entreParenteses = /^\(.*\)$/.test(t);
  // "1.234,56 D" ou "1.234,56D" — C e D no fim marcam crédito e débito. Exige
  // dígito antes pra não confundir com uma descrição que termine em "D".
  const marcadorDebito = /\d\s*D$/i.test(t);

  const limpo = t
    .replace(/^\(|\)$/g, "")
    .replace(/R\$/gi, "")
    .replace(/[CD]$/i, "")
    .replace(/\s/g, "")
    .trim();
  if (!limpo || !/\d/.test(limpo)) return NaN;

  const n = paraNumero(limpo);
  if (!Number.isFinite(n)) return NaN;
  return entreParenteses || marcadorDebito ? -Math.abs(n) : n;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/["']/g, "")
    .trim();
}

function acharColuna(cabecalho: string[], aliases: string[]): number {
  return cabecalho.findIndex((c) => aliases.includes(normalizar(c)));
}

/** Divide respeitando aspas — descrição de extrato costuma ter vírgula dentro. */
function dividirLinha(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      // "" dentro de campo entre aspas é uma aspa literal.
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === sep && !dentroAspas) {
      out.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  out.push(atual);
  return out.map((s) => s.trim().replace(/^"|"$/g, ""));
}

function detectarSeparador(linha: string): string {
  const candidatos = [";", ",", "\t"];
  // O separador certo é o que mais divide a linha; ponto e vírgula ganha
  // empate porque é o padrão de CSV brasileiro (vírgula é decimal).
  let melhor = ";";
  let max = -1;
  for (const c of candidatos) {
    const n = dividirLinha(linha, c).length;
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  return melhor;
}

/** "05/09/2026" ou "2026-09-05" -> "2026-09-05". */
function parseData(bruto: string): string | null {
  const br = bruto.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Ano com 2 dígitos aparece em export antigo: assume 20xx.
  const curto = bruto.match(/^(\d{2})[/-](\d{2})[/-](\d{2})$/);
  if (curto) return `20${curto[3]}-${curto[2]}-${curto[1]}`;
  return null;
}

export function parseCsvExtrato(conteudo: string): ResultadoCsv {
  const linhasTexto = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (linhasTexto.length < 2) {
    return { linhas: [], erro: "Arquivo vazio ou sem linhas de movimento." };
  }

  // Alguns bancos põem título e dados da conta antes do cabeçalho real —
  // procura a primeira linha que tenha uma coluna de data reconhecível.
  let idxCabecalho = -1;
  let sep = ";";
  for (let i = 0; i < Math.min(linhasTexto.length, 25); i++) {
    const s = detectarSeparador(linhasTexto[i]);
    const cols = dividirLinha(linhasTexto[i], s);
    if (acharColuna(cols, ALIASES_DATA) >= 0) {
      idxCabecalho = i;
      sep = s;
      break;
    }
  }
  if (idxCabecalho < 0) {
    return {
      linhas: [],
      erro: "Não encontrei uma coluna de data no arquivo.",
      colunasEncontradas: dividirLinha(linhasTexto[0], detectarSeparador(linhasTexto[0])),
    };
  }

  const cabecalho = dividirLinha(linhasTexto[idxCabecalho], sep);
  const iData = acharColuna(cabecalho, ALIASES_DATA);
  const iDescricao = acharColuna(cabecalho, ALIASES_DESCRICAO);
  const iValor = acharColuna(cabecalho, ALIASES_VALOR);
  const iDocumento = acharColuna(cabecalho, ALIASES_DOCUMENTO);
  const iCredito = acharColuna(cabecalho, ALIASES_CREDITO);
  const iDebito = acharColuna(cabecalho, ALIASES_DEBITO);

  if (iValor < 0 && (iCredito < 0 || iDebito < 0)) {
    return {
      linhas: [],
      erro: "Não encontrei coluna de valor (nem par crédito/débito).",
      colunasEncontradas: cabecalho,
    };
  }

  const linhas: LinhaOfx[] = [];
  const ignoradas: string[] = [];

  for (const texto of linhasTexto.slice(idxCabecalho + 1)) {
    const cols = dividirLinha(texto, sep);
    const data = parseData(cols[iData] ?? "");
    if (!data) continue; // linha de saldo, rodapé ou separador

    let valor: number;
    if (iValor >= 0) {
      valor = parseValorCelula(cols[iValor] ?? "");
    } else {
      const credito = parseValorCelula(cols[iCredito] ?? "") || 0;
      const debito = parseValorCelula(cols[iDebito] ?? "") || 0;
      // Débito costuma vir positivo em coluna própria — o sinal é a coluna.
      valor = credito - Math.abs(debito);
    }

    // Linha com data válida mas valor ilegível é sinal de coluna errada, não
    // de rodapé: guarda pra avisar em vez de sumir com o movimento em silêncio.
    if (!Number.isFinite(valor)) {
      ignoradas.push(texto.slice(0, 80));
      continue;
    }
    if (valor === 0) continue;

    linhas.push({
      data,
      descricao: (iDescricao >= 0 ? cols[iDescricao] : "")?.trim() || "Sem descrição",
      documento: iDocumento >= 0 ? cols[iDocumento]?.trim() || null : null,
      valor: Math.round(valor * 100) / 100,
      fitid: null,
    });
  }

  if (linhas.length === 0) {
    return {
      linhas: [],
      erro: "Nenhuma linha de movimento reconhecida.",
      colunasEncontradas: cabecalho,
    };
  }
  if (ignoradas.length > 0) {
    return {
      linhas,
      erro: `${ignoradas.length} linha(s) com data válida mas valor ilegível foram puladas — confira a coluna de valor. Primeira: "${ignoradas[0]}"`,
      colunasEncontradas: cabecalho,
    };
  }
  return { linhas };
}
