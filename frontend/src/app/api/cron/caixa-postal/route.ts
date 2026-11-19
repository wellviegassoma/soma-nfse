import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { empresasParaLer, lerCaixaPostalEmpresa } from "@/lib/caixa-postal";

export const maxDuration = 300;

// Só a LISTA da Caixa Postal (MSGCONTRIBUINTE61) — não dá ciência. Uma
// chamada paga por empresa. Pula quem já foi lido nas últimas 20h, então as
// rodadas seguidas do vercel.json (3 no mesmo dia, 10 min de intervalo)
// terminam a carteira se a primeira estourar o tempo, sem pagar duas vezes.
const PULAR_SE_LIDA_HA_MENOS_DE_MS = 20 * 60 * 60 * 1000;
const PARALELO = 6;
const ORCAMENTO_MS = 260_000;

export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const inicio = Date.now();
  const admin = createAdminClient();

  // ?empresa=<uuid>: lê só essa (chamada interna sob demanda, ex.: teste).
  const so = new URL(request.url).searchParams.get("empresa");
  const empresas = (await empresasParaLer(admin)).filter((e) => !so || e.id === so);
  const { data: leituras } = await admin.from("caixa_postal_leituras").select("company_id, lida_em");
  const ultima = new Map((leituras ?? []).map((l) => [l.company_id as string, new Date(l.lida_em as string).getTime()]));
  const fila = empresas.filter((e) => Date.now() - (ultima.get(e.id) ?? 0) > PULAR_SE_LIDA_HA_MENOS_DE_MS);

  let lidas = 0;
  let novas = 0;
  const falhas: { empresa: string; erro: string }[] = [];
  let i = 0;
  async function trabalhador() {
    while (i < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const e = fila[i++];
      const r = await lerCaixaPostalEmpresa(admin, e);
      if (r.ok) {
        lidas += 1;
        novas += r.novas;
      } else falhas.push({ empresa: e.nome, erro: r.erro });
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));

  return NextResponse.json({
    carteira: empresas.length,
    naFila: fila.length,
    lidas,
    novas,
    falhas: falhas.length,
    restantes: Math.max(0, fila.length - lidas - falhas.length),
    detalheFalhas: falhas.slice(0, 50),
  });
}
