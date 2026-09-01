import "server-only";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";

export function nomeArquivo(texto: string): string {
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas combinantes)
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .slice(0, 60) || "sem-nome"
  );
}

export function primeiroDiaMesSeguinte(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  const proximoMes = mes === 12 ? 1 : mes + 1;
  const proximoAno = mes === 12 ? ano + 1 : ano;
  return `${proximoAno}-${String(proximoMes).padStart(2, "0")}-01`;
}

type CompanyExport = { id: string; cnpj: string | null; legal_name: string; trade_name: string | null };

/**
 * Gera o ZIP de UMA empresa (XML + PDF de cada nota + relatório
 * consolidado) pra competência pedida. Retorna null se a empresa não tem
 * nota nenhuma no mês — nesse caso não há nada pra incluir na exportação.
 * Cada chamada de PDF/relatório vai pro backend Python, que só renderiza
 * localmente (não bate em servidor do governo), então paralelizar aqui é
 * seguro.
 */
export async function gerarZipDaEmpresa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  company: CompanyExport,
  competencia: string,
): Promise<Uint8Array | null> {
  if (!company.cnpj) return null;

  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  const { data: notas } = await supabase
    .from("notas_distribuidas")
    .select(
      "nsu, chave_acesso, data_emissao, xml, prestador_cnpj, tomador_cnpj, numero, competencia, tomador_nome, prestador_nome, descricao_servico, local_incidencia, codigo_trib_nacional, codigo_nbs, aliquota_issqn, valor_servico, valor_issqn, valor_pis, valor_cofins, valor_ret_cp, valor_ret_irrf, cancelada, motivo_cancelamento, bate_competencia",
    )
    .eq("company_id", company.id)
    .gte("competencia", `${competencia}-01`)
    .lt("competencia", primeiroDiaMesSeguinte(competencia));

  if (!notas || notas.length === 0) return null;

  const zip = new JSZip();
  const pastaEmpresa = zip.folder(nomeArquivo(company.trade_name || company.legal_name));
  if (!pastaEmpresa) return null;
  const pastaXml = pastaEmpresa.folder("xml");
  const pastaPdf = pastaEmpresa.folder("pdf");

  // Gerar cada PDF é uma chamada HTTP ao backend, mas 100% local (sem
  // tocar em servidor do governo) — paralelizar em lotes pequenos corta
  // bastante do tempo total sem sobrecarregar o backend.
  const CONCORRENCIA = 8;
  for (let i = 0; i < notas.length; i += CONCORRENCIA) {
    const lote = notas.slice(i, i + CONCORRENCIA);
    await Promise.all(
      lote.map(async (nota) => {
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
          // Falha ao gerar o DANFSe de uma nota não derruba a exportação
          // — o XML dela já foi incluído, e é o documento fiscal válido.
        }
      }),
    );
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
    // idem — exportação segue sem o relatório consolidado dessa empresa
  }

  return zip.generateAsync({ type: "uint8array" });
}
