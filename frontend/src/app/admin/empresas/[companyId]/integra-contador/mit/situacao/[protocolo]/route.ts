import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";

// Proxy pro MIT.SITUACAOENC315 já cadastrado no backend (TTL de cache
// curto lá, 30s, pra servir polling sem ficar preso numa resposta velha)
// — acompanha o encerramento de uma apuração criada por
// /mit/declarar até virar ENCERRADA.
export async function GET(
  _request: Request,
  props: { params: Promise<{ companyId: string; protocolo: string }> },
) {
  await requireSomaStaff();
  const { companyId, protocolo } = await props.params;

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) {
    return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(
      // protocolo_encerramento vai como query, não path — é base64 (pode
      // ter "/"), e path segments não casam %2F de forma confiável (404
      // real na primeira tentativa de polling, ver comentário no backend).
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj}/mit/situacao-encerramento?protocolo_encerramento=${encodeURIComponent(protocolo)}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar a situação do encerramento agora. Tente novamente em instantes." },
      { status: 502 },
    );
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({ error: body?.detail ?? "Não foi possível consultar." }, { status: 502 });
  }

  const dadosResposta = body.resposta?.dados ? JSON.parse(body.resposta.dados) : null;
  const textoSituacao = dadosResposta?.textoSituacao ?? null;

  // Melhor esforço — mantém o histórico auditável (Fase U) com o status
  // mais recente conhecido, sem bloquear a resposta se a escrita falhar.
  if (textoSituacao) {
    supabase
      .from("integra_contador_mit_encerramentos")
      .update({ situacao_apuracao: textoSituacao, id_apuracao: dadosResposta?.idApuracao ?? null })
      .eq("protocolo_encerramento", protocolo)
      .then(({ error }) => {
        if (error) console.error("Falha ao atualizar histórico de encerramento do MIT:", error);
      });
  }

  return NextResponse.json({
    idApuracao: dadosResposta?.idApuracao ?? null,
    situacaoApuracao: dadosResposta?.situacaoApuracao ?? null,
    textoSituacao,
    dataEncerramento: dadosResposta?.dataEncerramento ?? null,
    avisosDctf: dadosResposta?.avisosDctf ?? null,
  });
}
