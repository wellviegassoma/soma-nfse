import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autorizarChamadaInterna } from "@/lib/internal-auth";
import { empresasParaLer } from "@/lib/caixa-postal";
import { lerDecRjEmpresa } from "@/lib/dec-rj";

export const maxDuration = 300;

// DeC da SEFAZ-RJ pela Infosimples — sem abrir mensagem não lida (não dá
// ciência; ver lib/dec-rj.ts). Uma consulta paga por empresa. Empresa que
// respondeu "sem DeC" (sem ICMS-RJ ou sem e-Procuração) fica com ativo=false
// e sai das próximas rodadas. Pula quem já foi lido nas últimas 20h, então as
// rodadas seguidas do vercel.json terminam a carteira sem pagar duas vezes.
const PULAR_SE_LIDA_HA_MENOS_DE_MS = 20 * 60 * 60 * 1000;
const PARALELO = 4;
const ORCAMENTO_MS = 250_000;

export async function GET(request: Request) {
  if (!autorizarChamadaInterna(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const inicio = Date.now();
  const admin = createAdminClient();
  const params = new URL(request.url).searchParams;
  const so = params.get("empresa");
  const ie = so ? (params.get("ie") ?? "").replace(/\D/g, "") || null : null;

  const empresas = (await empresasParaLer(admin)).filter((e) => !so || e.id === so);
  const { data: leituras } = await admin.from("dec_rj_leituras").select("company_id, lida_em, ativo");
  const porEmpresa = new Map((leituras ?? []).map((l) => [l.company_id as string, l]));
  const fila = empresas.filter((e) => {
    const l = porEmpresa.get(e.id);
    if (!l) return true;
    if (l.ativo === false && !so) return false;
    return so || Date.now() - new Date(l.lida_em as string).getTime() > PULAR_SE_LIDA_HA_MENOS_DE_MS;
  });

  let lidas = 0;
  let novas = 0;
  let semDec = 0;
  const falhas: { empresa: string; erro: string }[] = [];
  let i = 0;
  async function trabalhador() {
    while (i < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const e = fila[i++];
      const r = await lerDecRjEmpresa(admin, { ...e, ie });
      if (r.ok) {
        lidas += 1;
        novas += r.novas;
      } else if (r.semDec) semDec += 1;
      else falhas.push({ empresa: e.nome, erro: r.erro });
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));

  return NextResponse.json({
    carteira: empresas.length,
    naFila: fila.length,
    lidas,
    novas,
    semDec,
    falhas: falhas.length,
    restantes: Math.max(0, fila.length - lidas - semDec - falhas.length),
    detalheFalhas: falhas.slice(0, 50),
  });
}
