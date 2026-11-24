import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarEsteiraNewton } from "@/lib/newton";
import { gerarExcelAnalista, nomeArquivoAnalista, relatorioNewton } from "@/lib/analista-export";
import { gerarPdfAnalista } from "@/lib/analista-export-pdf";

export const maxDuration = 300;

/** Exporta a tela do Newton: ?formato=xlsx|pdf&competencia=AAAA-MM&situacao=acao|ia|concluida|todas&cidade=… */
export async function GET(request: Request) {
  await requireSomaStaff();
  const sp = new URL(request.url).searchParams;
  const competencia = /^\d{4}-\d{2}$/.test(sp.get("competencia") ?? "") ? sp.get("competencia")! : mesAnteriorBrasilia();
  const formato = sp.get("formato") === "pdf" ? "pdf" : "xlsx";
  const db = await createClient();
  const linhas = await carregarEsteiraNewton(db, competencia);
  const rel = await relatorioNewton(db, competencia, linhas, { situacao: sp.get("situacao") ?? "todas", cidade: sp.get("cidade") ?? "" });
  const buffer = formato === "pdf" ? await gerarPdfAnalista(rel) : await gerarExcelAnalista(rel);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivoAnalista(rel, formato)}"`,
    },
  });
}
