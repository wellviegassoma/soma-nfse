import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { buscarEmpresaPetropolis } from "@/lib/iss-petropolis";
import { salvarPagamentoIss, type PagamentoIss } from "@/lib/iss-pagamentos";

export const maxDuration = 120;

// SÓ LEITURA: a guia de ISS da competência foi paga na Prefeitura de Petrópolis?
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;
  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia") ?? "";
  if (!/^\d{4}-\d{2}$/.test(competencia)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const empresa = await buscarEmpresaPetropolis(supabase, companyId);
  if (!empresa.ok) return NextResponse.json({ error: empresa.erro }, { status: empresa.status });

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/petropolis/pagamento-iss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "" },
      body: JSON.stringify({
        cnpj: empresa.cnpj,
        competencia,
        login: empresa.loginProprio?.login,
        senha_md5: empresa.loginProprio?.senhaMd5,
        cmc: empresa.cmc,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(100_000),
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o site da Prefeitura agora." }, { status: 502 });
  }
  const corpo = await response.json().catch(() => null);
  if (!response.ok) {
    const mensagem = (corpo && typeof corpo.detail === "string" && corpo.detail) || `Serviço respondeu HTTP ${response.status}.`;
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const resultado: PagamentoIss = {
    status: corpo.status,
    pagas: (corpo.pagas ?? []).map((p: Record<string, unknown>) => ({
      valor: p.valor ?? null,
      vencimento: p.vencimento ?? null,
      identificador: p.identificador ?? null,
      pago_em: p.pago_em ?? null,
    })),
    abertas: (corpo.abertas ?? []).map((p: Record<string, unknown>) => ({
      valor: p.valor ?? null,
      vencimento: p.vencimento ?? null,
      identificador: p.identificador ?? null,
    })),
    mensagem: null,
    verificadoEm: new Date().toISOString(),
  };
  await salvarPagamentoIss(supabase, { companyId, competencia, municipio: "petropolis", resultado, userId: user?.id ?? null });
  return NextResponse.json(resultado);
}
