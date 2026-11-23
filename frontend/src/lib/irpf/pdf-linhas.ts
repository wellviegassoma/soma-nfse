import "server-only";
import { PDFParse } from "pdf-parse";
import { montarLinhas, type ItemPdf, type LinhaPdf } from "./pdf-parser";

// O texto "corrido" do pdf-parse sai na ordem do conteúdo do PDF, que nos
// PDFs do programa do IRPF mistura rótulos e valores (RESUMO em duas
// colunas). Aqui pegamos cada pedaço com a posição na página e remontamos
// as linhas visuais. Reaproveita o documento pdf.js que o próprio pdf-parse
// carrega (campo privado `doc`) para não precisar de outra configuração de
// worker/empacotamento no deploy (ver next.config.ts).
export async function linhasDoPdf(dados: Uint8Array): Promise<LinhaPdf[]> {
  const parser = new PDFParse({ data: dados });
  try {
    await parser.getInfo();
    const doc = (parser as unknown as { doc: PdfDoc }).doc;
    const itens: ItemPdf[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const conteudo = await pagina.getTextContent();
      for (const it of conteudo.items) {
        if (!("str" in it) || !it.str.trim()) continue;
        itens.push({ pagina: p, x: it.transform[4], y: it.transform[5], largura: it.width ?? 0, texto: it.str });
      }
    }
    return montarLinhas(itens);
  } finally {
    await parser.destroy().catch(() => {});
  }
}

type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: Array<{ str: string; transform: number[]; width?: number } | { type: string }> }>;
  }>;
};
