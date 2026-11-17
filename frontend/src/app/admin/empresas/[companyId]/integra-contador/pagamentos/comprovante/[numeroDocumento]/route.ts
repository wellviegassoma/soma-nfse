import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { contentDispositionInline, prefixoArquivoEmpresa } from "@/lib/nome-arquivo-empresa";
import { acharPdfBase64 } from "@/lib/pagamentos-federais-core";

export const maxDuration = 90;

// Comprovante de arrecadação (PDF) — PAGTOWEB.COMPARRECADACAO72. Cada
// emissão é cobrada; o serviço guarda 180 dias, então abrir de novo não
// emite de novo. Só quando alguém clica — nunca em lote.
export async function GET(_request: Request, props: { params: Promise<{ companyId: string; numeroDocumento: string }> }) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;
  const { companyId, numeroDocumento } = await props.params;
  if (!/^[0-9A-Za-z.-]{1,17}$/.test(numeroDocumento)) {
    return NextResponse.json({ error: "Número de documento inválido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("cnpj, codigo_cliente, trade_name, legal_name")
    .eq("id", companyId)
    .single();
  if (!company?.cnpj) return NextResponse.json({ error: "Essa empresa não tem CNPJ cadastrado." }, { status: 400 });

  let r: Response;
  try {
    r = await fetch(
      `${process.env.INTEGRA_CONTADOR_URL}/contribuintes/${company.cnpj.replace(/\D/g, "")}/pagamentos/comprovante/${numeroDocumento}`,
      {
        headers: { "X-Internal-Token": process.env.INTEGRA_CONTADOR_INTERNAL_TOKEN ?? "" },
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch {
    return NextResponse.json({ error: "Não foi possível falar com o Integra Contador agora." }, { status: 502 });
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return NextResponse.json({ error: corpo?.detail ?? "A Receita recusou o comprovante." }, { status: 502 });

  const pdf = acharPdfBase64(corpo?.resposta?.dados ?? corpo?.resposta);
  if (!pdf) {
    console.error("comprovante: PDF não encontrado na resposta", JSON.stringify(corpo?.resposta ?? {}).slice(0, 500));
    return NextResponse.json({ error: "A Receita não devolveu o PDF do comprovante." }, { status: 502 });
  }
  return new NextResponse(Buffer.from(pdf, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDispositionInline(`${prefixoArquivoEmpresa(company)} - Comprovante ${numeroDocumento}.pdf`),
    },
  });
}
