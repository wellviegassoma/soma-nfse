import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { buscarGuiaIssRetidoPetropolis } from "@/lib/iss-petropolis";
import { competenciaParaArquivo, contentDispositionInline, prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";

export const maxDuration = 90;

// PDF da guia do ISS retido (como tomador) de Petrópolis — débito ISRSN da
// competência, que a Prefeitura gera a partir das notas recebidas.
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const competencia = new URL(request.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const resposta = await buscarGuiaIssRetidoPetropolis(supabase, companyId, competencia);
  if (!resposta.ok) return NextResponse.json({ error: resposta.erro }, { status: 502 });

  const { data: company } = await supabase
    .from("companies")
    .select("codigo_cliente, trade_name, legal_name")
    .eq("id", companyId)
    .single();
  const nome = `${company ? prefixoArquivoEmpresa(company) : "empresa"} - ISS retido ${competenciaParaArquivo(competencia)}.pdf`;

  return new NextResponse(resposta.pdfBytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(nome),
      "X-Valor-Guia": resposta.valor.toFixed(2),
    },
  });
}
