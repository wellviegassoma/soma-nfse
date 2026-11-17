import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { mesAnteriorBrasilia } from "@/lib/competencia";
import { carregarCentralReinf, totaisReinf } from "@/lib/reinf";
import { gerarRelatorioReinfHtml } from "@/lib/reinf-export";

// Página pronta para imprimir/salvar em PDF (abre a janela de impressão).
export async function GET(req: NextRequest) {
  await requireSomaStaff();
  const p = req.nextUrl.searchParams.get("competencia");
  const competencia = p && /^\d{4}-\d{2}$/.test(p) ? p : mesAnteriorBrasilia();
  const { empresas } = await carregarCentralReinf(await createClient(), competencia);
  const html = gerarRelatorioReinfHtml(competencia, empresas, totaisReinf(empresas), new Date());
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
