import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { empresasParaLer } from "@/lib/caixa-postal";
import { verificarSituacaoEmpresa } from "@/lib/situacao-cnpj";

export const maxDuration = 300;

// Situação cadastral do CNPJ de toda a carteira pela BrasilAPI (gratuita).
// Pula quem foi verificado com sucesso nas últimas 20h, então as rodadas
// seguidas do vercel.json terminam a carteira. Duas por vez, com uma pausa
// curta, para não levar 429 da BrasilAPI.
const PULAR_SE_VERIFICADA_HA_MENOS_DE_MS = 20 * 60 * 60 * 1000;
const PARALELO = 2;
const PAUSA_MS = 400;
const ORCAMENTO_MS = 260_000;

export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const inicio = Date.now();
  const admin = createAdminClient();
  const so = new URL(request.url).searchParams.get("empresa");

  const empresas = (await empresasParaLer(admin)).filter((e) => !so || e.id === so);
  const { data: vistas } = await admin.from("cnpj_situacoes").select("company_id, verificado_em, ok");
  const porEmpresa = new Map((vistas ?? []).map((v) => [v.company_id as string, v]));
  const fila = empresas.filter((e) => {
    const v = porEmpresa.get(e.id);
    return so || !v || !v.ok || Date.now() - new Date(v.verificado_em as string).getTime() > PULAR_SE_VERIFICADA_HA_MENOS_DE_MS;
  });

  let verificadas = 0;
  let alertas = 0;
  const foraDeAtiva: { empresa: string; situacao: string | null }[] = [];
  const falhas: { empresa: string; erro: string }[] = [];
  let i = 0;
  async function trabalhador() {
    while (i < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const e = fila[i++];
      const r = await verificarSituacaoEmpresa(admin, e);
      if (r.ok) {
        verificadas += 1;
        if (r.alertou) alertas += 1;
        if (r.situacao !== "ATIVA") foraDeAtiva.push({ empresa: e.nome, situacao: r.situacao });
      } else falhas.push({ empresa: e.nome, erro: r.erro });
      await new Promise((res) => setTimeout(res, PAUSA_MS));
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));

  return NextResponse.json({
    carteira: empresas.length,
    naFila: fila.length,
    verificadas,
    alertasNovos: alertas,
    foraDeAtiva,
    falhas: falhas.length,
    restantes: Math.max(0, fila.length - verificadas - falhas.length),
    detalheFalhas: falhas.slice(0, 30),
  });
}
