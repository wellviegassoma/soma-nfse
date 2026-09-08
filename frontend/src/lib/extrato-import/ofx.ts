import "server-only";

/**
 * Parser de OFX (Open Financial Exchange) — o formato que praticamente todo
 * banco brasileiro exporta. É o caminho principal de importação de extrato:
 * determinístico, sem custo e sem depender de IA.
 *
 * OFX 1.x é SGML, não XML: tags podem não ter fechamento (`<TRNAMT>-50.00`
 * termina na próxima tag). Por isso o parse é por regex sobre blocos
 * <STMTTRN>, e não por um parser de XML — que engasga na maioria dos arquivos
 * reais. OFX 2.x é XML de verdade, e a mesma regex funciona nele também.
 */

export type LinhaOfx = {
  data: string; // YYYY-MM-DD
  descricao: string;
  documento: string | null;
  valor: number; // com sinal: negativo saiu da conta
  fitid: string | null;
};

export type ResultadoOfx = {
  linhas: LinhaOfx[];
  periodoInicio: string | null;
  periodoFim: string | null;
  /** Vem do <BALAMT> do OFX; serve pra conferir o saldo final depois. */
  saldoFinal: number | null;
};

/**
 * Lê o valor de uma tag SGML: `<TAG>valor` até a próxima `<` ou fim de linha.
 * Também funciona com `<TAG>valor</TAG>` do OFX 2.x.
 */
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() || null : null;
}

/**
 * Data OFX: YYYYMMDD, podendo vir com hora e fuso
 * (`20260908120000[-3:BRT]`). Só a parte da data importa pro extrato —
 * converter com fuso arriscaria mover o lançamento de dia.
 */
function parseDataOfx(bruto: string | null): string | null {
  if (!bruto) return null;
  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseValorOfx(bruto: string | null): number | null {
  if (!bruto) return null;
  // Alguns bancos mandam vírgula decimal mesmo em OFX, contra a especificação.
  const normalizado = bruto.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function parseOfx(conteudo: string): ResultadoOfx {
  const linhas: LinhaOfx[] = [];

  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  for (const bloco of blocos) {
    const data = parseDataOfx(tag(bloco, "DTPOSTED"));
    const valor = parseValorOfx(tag(bloco, "TRNAMT"));
    if (!data || valor === null || valor === 0) continue;

    // NAME é o campo curto, MEMO o longo. Bancos brasileiros usam um ou outro
    // conforme o humor, então junta os dois sem repetir.
    const name = tag(bloco, "NAME");
    const memo = tag(bloco, "MEMO");
    const partes = [name, memo].filter(Boolean) as string[];
    const descricao =
      partes.length === 2 && partes[1].includes(partes[0])
        ? partes[1]
        : [...new Set(partes)].join(" - ");

    linhas.push({
      data,
      descricao: descricao || "Sem descrição",
      documento: tag(bloco, "CHECKNUM") ?? tag(bloco, "REFNUM"),
      valor: Math.round(valor * 100) / 100,
      fitid: tag(bloco, "FITID"),
    });
  }

  return {
    linhas,
    periodoInicio: parseDataOfx(tag(conteudo, "DTSTART")),
    periodoFim: parseDataOfx(tag(conteudo, "DTEND")),
    saldoFinal: parseValorOfx(tag(conteudo, "BALAMT")),
  };
}
