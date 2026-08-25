import { NextResponse } from "next/server";
import JSZip from "jszip";
import { requireSomaStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

function nomeArquivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas combinantes)
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 60) || "sem-nome"
  );
}

function primeiroDiaMesSeguinte(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
}

export async function GET(request: Request) {
  await requireSomaStaff();

  const competencia = new URL(request.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
  }
  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, cnpj, legal_name, trade_name");

  const zip = new JSZip();

  for (const company of companies ?? []) {
    if (!company.cnpj) continue;

    const { data: notas } = await supabase
      .from("notas_distribuidas")
      .select(
        "nsu, chave_acesso, data_emissao, xml, prestador_cnpj, tomador_cnpj, numero, competencia, tomador_nome, prestador_nome, descricao_servico, local_incidencia, codigo_trib_nacional, codigo_nbs, aliquota_issqn, valor_servico, valor_issqn, valor_pis, valor_cofins, valor_ret_cp, valor_ret_irrf, cancelada, motivo_cancelamento, bate_competencia",
      )
      .eq("company_id", company.id)
      .gte("competencia", `${competencia}-01`)
      .lt("competencia", primeiroDiaMesSeguinte(competencia));

    if (!notas || notas.length === 0) continue;

    const pastaEmpresa = zip.folder(nomeArquivo(company.trade_name || company.legal_name));
    if (!pastaEmpresa) continue;
    const pastaXml = pastaEmpresa.folder("xml");
    const pastaPdf = pastaEmpresa.folder("pdf");

    for (const nota of notas) {
      const nomeBase = nomeArquivo(`${nota.numero || nota.nsu}-${nota.chave_acesso || nota.nsu}`);
      pastaXml?.file(`${nomeBase}.xml`, nota.xml);

      try {
        const respPdf = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/danfse`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
          },
          body: JSON.stringify({ xml_nfse: nota.xml, cancelada: nota.cancelada }),
          cache: "no-store",
        });
        if (respPdf.ok) {
          const pdfBytes = await respPdf.arrayBuffer();
          pastaPdf?.file(`${nomeBase}.pdf`, pdfBytes);
        }
      } catch {
        // Falha ao gerar o DANFSe de uma nota não derruba o export inteiro
        // — o XML dela já foi incluído, e é o documento fiscal válido.
      }
    }

    try {
      const respRelatorio = await fetch(`${process.env.NFSE_ENGINE_URL}/relatorios/faturamento`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
        },
        body: JSON.stringify({
          nome_empresa: company.trade_name || company.legal_name,
          cnpj_empresa: company.cnpj,
          ano,
          mes,
          notas: notas.map((n) => ({ ...n, nsu: String(n.nsu) })),
        }),
        cache: "no-store",
      });
      if (respRelatorio.ok) {
        const relatorioBytes = await respRelatorio.arrayBuffer();
        pastaEmpresa.file(`relatorio-${competencia}.pdf`, relatorioBytes);
      }
    } catch {
      // idem — export segue sem o relatório consolidado dessa empresa
    }
  }

  const zipBytes = await zip.generateAsync({ type: "nodebuffer" });
  // Uint8Array.from copia pra um ArrayBuffer "normal" — o Buffer do Node
  // é tipado sobre ArrayBufferLike (que inclui SharedArrayBuffer), e
  // BlobPart exige especificamente ArrayBuffer.
  return new NextResponse(new Blob([Uint8Array.from(zipBytes)]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="fechamento-${competencia}.zip"`,
    },
  });
}
