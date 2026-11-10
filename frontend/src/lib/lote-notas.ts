import "server-only";
import ExcelJS from "exceljs";

// Planilha de emissão em lote: uma linha por nota. Colunas na ordem do
// modelo; a leitura procura pelo título (tolerante a acento/maiúscula), então
// a pessoa pode reordenar ou apagar as colunas opcionais.
export const COLUNAS_LOTE = [
  { chave: "documento", titulo: "CPF/CNPJ do tomador", largura: 22, obrigatoria: true },
  { chave: "nome", titulo: "Nome do tomador (só para conferir)", largura: 34 },
  { chave: "valor", titulo: "Valor", largura: 12, obrigatoria: true },
  { chave: "descricao", titulo: "Descrição (em branco = padrão do serviço)", largura: 40 },
  { chave: "data", titulo: "Data (em branco = hoje)", largura: 16 },
  { chave: "servico", titulo: "Serviço (em branco = o mais usado)", largura: 28 },
  { chave: "issRetido", titulo: "ISS retido? (S/N)", largura: 12 },
  { chave: "aliquotaIss", titulo: "Alíquota ISS %", largura: 12 },
  { chave: "irrf", titulo: "IRRF %", largura: 10 },
  { chave: "csrf", titulo: "PIS/COFINS/CSLL %", largura: 14 },
  { chave: "inss", titulo: "INSS %", largura: 10 },
] as const;

export type ChaveColuna = (typeof COLUNAS_LOTE)[number]["chave"];
export type LinhaBruta = { linha: number } & Partial<Record<ChaveColuna, string | number | Date>>;

export const MAX_LINHAS_LOTE = 200;

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function gerarModeloLote(servicos: { name: string }[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Notas");
  ws.columns = COLUNAS_LOTE.map((c) => ({ header: c.titulo, key: c.chave, width: c.largura }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
  ws.getRow(1).height = 30;
  ws.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  // CPF/CNPJ como texto pra não perder zero à esquerda.
  ws.getColumn("documento").numFmt = "@";
  ws.getColumn("valor").numFmt = "#,##0.00";
  ws.getColumn("data").numFmt = "dd/mm/yyyy";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const ajuda = wb.addWorksheet("Como preencher");
  ajuda.columns = [{ width: 110 }];
  [
    "Uma linha por nota, na aba Notas. Só CPF/CNPJ e Valor são obrigatórios.",
    "O tomador precisa já estar cadastrado na empresa (com endereço). Quem não estiver aparece na conferência.",
    "Data em branco = hoje. Descrição em branco = descrição padrão do serviço.",
    "Serviço: escreva o nome igual ao cadastro. Em branco = o serviço mais usado da empresa.",
    "Retenções em branco = padrão do serviço. Tomador pessoa física nunca tem retenção.",
    "Nada é emitido ao enviar a planilha: o sistema mostra a conferência e só emite quando você confirmar.",
    "",
    "Serviços desta empresa:",
    ...servicos.map((s) => `  • ${s.name}`),
  ].forEach((t) => ajuda.addRow([t]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function valorCelula(v: ExcelJS.CellValue): string | number | Date | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number" || v instanceof Date) return v;
  if (typeof v === "boolean") return v ? "S" : "N";
  if (typeof v === "object") {
    if ("result" in v && v.result != null) return valorCelula(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
  }
  return undefined;
}

export async function lerPlanilhaLote(arquivo: ArrayBuffer): Promise<{ linhas: LinhaBruta[] } | { error: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arquivo);
  } catch {
    return { error: "Não consegui abrir o arquivo. Envie a planilha em formato .xlsx (use o modelo)." };
  }
  const ws = wb.getWorksheet("Notas") ?? wb.worksheets[0];
  if (!ws) return { error: "A planilha está vazia." };

  const porTitulo = new Map(COLUNAS_LOTE.map((c) => [normalizar(c.titulo), c.chave]));
  const indice = new Map<number, ChaveColuna>();
  ws.getRow(1).eachCell((cell, col) => {
    const titulo = normalizar(String(valorCelula(cell.value) ?? ""));
    const chave =
      porTitulo.get(titulo) ??
      COLUNAS_LOTE.find((c) => titulo.startsWith(normalizar(c.titulo).split(" (")[0]))?.chave;
    if (chave) indice.set(col, chave);
  });
  const chaves = new Set(indice.values());
  if (!chaves.has("documento") || !chaves.has("valor")) {
    return { error: "Não achei as colunas “CPF/CNPJ do tomador” e “Valor” na primeira linha. Use o modelo." };
  }

  const linhas: LinhaBruta[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const l: LinhaBruta = { linha: n };
    let temAlgo = false;
    for (const [col, chave] of indice) {
      const v = valorCelula(row.getCell(col).value);
      if (v !== undefined && String(v).trim() !== "") {
        l[chave] = typeof v === "string" ? v.trim() : v;
        temAlgo = true;
      }
    }
    if (temAlgo) linhas.push(l);
  });
  if (linhas.length === 0) return { error: "A planilha não tem nenhuma nota preenchida." };
  if (linhas.length > MAX_LINHAS_LOTE) {
    return { error: `A planilha tem ${linhas.length} notas — o limite por lote é ${MAX_LINHAS_LOTE}. Divida em partes.` };
  }
  return { linhas };
}
