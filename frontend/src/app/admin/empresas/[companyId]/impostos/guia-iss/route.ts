import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { autorizarApi } from "@/lib/auth";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { documentoEmpresa } from "@/lib/formatters";

// Código IBGE do município do Rio de Janeiro — o Nota Carioca só existe
// pra empresas estabelecidas nessa cidade.
const IBGE_RIO_DE_JANEIRO = "3304557";

// O fluxo real (login + eventual emissão da guia + exportar PDF) passa
// por um Chromium de verdade (ver nota-carioca-service) e pode levar
// mais de 1 minuto num site historicamente lento — folga generosa.
export const maxDuration = 120;

export async function GET(
  request: Request,
  props: { params: Promise<{ companyId: string }> },
) {
  const naoAutorizado = await autorizarApi("impostos.ver");
  if (naoAutorizado) return naoAutorizado;

  const { companyId } = await props.params;
  const searchParams = new URL(request.url).searchParams;
  const competencia = searchParams.get("competencia");
  // Reabre a guia de sociedade uniprofissional já emitida — some da grade
  // do Nota Carioca e, quando há ISS retido, o mês lá é a guia do retido.
  const uniprofissionalExistente = searchParams.get("uniprofissional") === "1";
  if (competencia && !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select(
      "cnpj, cpf, municipality_ibge_code, iss_tipo, iss_quantidade_profissionais, certificates(encrypted_file, encrypted_password, expires_at)",
    )
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }
  if (company.municipality_ibge_code !== IBGE_RIO_DE_JANEIRO) {
    return NextResponse.json(
      { error: "Guia de ISS via Nota Carioca só está disponível para empresas do Rio de Janeiro." },
      { status: 400 },
    );
  }

  const certificado = Array.isArray(company.certificates)
    ? company.certificates[0]
    : company.certificates;
  if (!certificado) {
    return NextResponse.json({ error: "Empresa sem certificado digital cadastrado." }, { status: 400 });
  }
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Certificado digital vencido." }, { status: 400 });
  }
  if (!documentoEmpresa(company)) {
    return NextResponse.json({ error: "Empresa sem CNPJ/CPF cadastrado." }, { status: 400 });
  }

  const pfxBase64 = decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64");
  const senha = decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8");

  let response: Response;
  try {
    response = await fetch(`${process.env.NOTA_CARIOCA_SERVICE_URL}/guia-iss`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NOTA_CARIOCA_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        certificado: { pfx_base64: pfxBase64, senha },
        competencia,
        // Sociedade uniprofissional: guia ainda não emitida pede a
        // quantidade de profissionais no próprio site.
        quantidade_profissionais:
          company.iss_tipo === "FIXO" && !uniprofissionalExistente
            ? company.iss_quantidade_profissionais
            : null,
        uniprofissional_existente: uniprofissionalExistente,
        // Ordem do CNPJ ≠ 0001 = filial; o certificado da matriz enxerga as
        // duas inscrições no Nota Carioca.
        filial: company.cnpj ? company.cnpj.replace(/\D/g, "").slice(8, 12) !== "0001" : null,
        // Só leitura — investigação de onde o site guarda guias emitidas.
        diagnostico: searchParams.get("diagnostico") === "1",
        diagnostico_pagina: searchParams.get("pagina"),
        diagnostico_cliques: searchParams.get("cliques")?.split(",").filter(Boolean) ?? null,
      }),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "Não foi possível acessar o Nota Carioca agora." }, { status: 502 });
  }

  if (!response.ok) {
    const corpo = await response.json().catch(() => null);
    const mensagem =
      (corpo && typeof corpo.detail === "string" && corpo.detail) ||
      `Não foi possível buscar a guia de ISS agora (serviço do Nota Carioca respondeu HTTP ${response.status}).`;
    return NextResponse.json({ error: mensagem }, { status: 502 });
  }

  const pdfBytes = await response.arrayBuffer();
  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="guia-iss-${competencia ?? "atual"}.pdf"`,
  };
  for (const nome of [
    "X-Regime",
    "X-Quantidade-Profissionais",
    "X-Valor-Servicos",
    "X-Base-Calculo",
    "X-Valor-Iss",
    "X-Valor-Total",
  ]) {
    const valor = response.headers.get(nome);
    if (valor) headers[nome] = valor;
  }
  return new NextResponse(pdfBytes, { headers });
}
