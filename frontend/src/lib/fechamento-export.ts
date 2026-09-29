import "server-only";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { documentoEmpresa } from "@/lib/formatters";

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

type CompanyExport = {
  id: string;
  cnpj: string | null;
  cpf: string | null;
  legal_name: string;
  trade_name: string | null;
};

type NotaExport = {
  nsu: string | number;
  chave_acesso: string | null;
  data_emissao: string | null;
  xml: string;
  prestador_cnpj: string | null;
  tomador_cnpj: string | null;
  numero: string | null;
  competencia: string | null;
  tomador_nome: string | null;
  prestador_nome: string | null;
  descricao_servico: string | null;
  local_incidencia: string | null;
  codigo_trib_nacional: string | null;
  codigo_nbs: string | null;
  aliquota_issqn: number | null;
  valor_servico: number | null;
  valor_issqn: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_ret_cp: number | null;
  valor_ret_irrf: number | null;
  valor_ret_csll: number | null;
  cancelada: boolean;
  motivo_cancelamento: string | null;
  bate_competencia: boolean;
};

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
  const documento = documentoEmpresa(company);
  if (!documento) return null;

  const [anoStr, mesStr] = competencia.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);

  // Paginado — mesmo raciocínio de `iniciarExportacaoFechamento`: uma
  // empresa isolada não deveria chegar perto de 1000 notas num mês hoje,
  // mas nada garante isso pra sempre, e o custo de paginar aqui é zero.
  const notas = await buscarTudoPaginado<NotaExport>((from, to) =>
    supabase
      .from("notas_distribuidas")
      .select(
        "nsu, chave_acesso, data_emissao, xml, prestador_cnpj, tomador_cnpj, numero, competencia, tomador_nome, prestador_nome, descricao_servico, local_incidencia, codigo_trib_nacional, codigo_nbs, aliquota_issqn, valor_servico, valor_issqn, valor_pis, valor_cofins, valor_ret_cp, valor_ret_irrf, valor_ret_csll, cancelada, motivo_cancelamento, bate_competencia",
      )
      .eq("company_id", company.id)
      .gte("competencia", `${competencia}-01`)
      .lt("competencia", primeiroDiaMesSeguinte(competencia))
      .range(from, to),
  );

  if (notas.length === 0) return null;

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
        cnpj_empresa: documento,
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

type NotaPlanilha = {
  numero: string | null;
  chave_acesso: string | null;
  direcao: "saida" | "entrada" | "indefinida";
  cancelada: boolean;
  motivo_cancelamento: string | null;
  data_emissao: string | null;
  competencia: string | null;
  bate_competencia: boolean;
  prestador_cnpj: string | null;
  prestador_nome: string | null;
  tomador_cnpj: string | null;
  tomador_nome: string | null;
  descricao_servico: string | null;
  local_incidencia: string | null;
  codigo_trib_nacional: string | null;
  codigo_nbs: string | null;
  aliquota_issqn: number | null;
  valor_servico: number | null;
  valor_issqn: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_ret_cp: number | null;
  valor_ret_irrf: number | null;
  valor_ret_csll: number | null;
};

const DIRECAO_LABELS: Record<NotaPlanilha["direcao"], string> = {
  saida: "Saída",
  entrada: "Entrada",
  indefinida: "Não classificada",
};

/**
 * Planilha com todas as notas de UMA empresa na competência pedida — usada
 * pelo botão "Baixar planilha" na tela de fechamento por empresa.
 */
export async function gerarPlanilhaNotasDaEmpresa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  companyId: string,
  competencia: string,
): Promise<Buffer> {
  const notas = await buscarTudoPaginado<NotaPlanilha>((from, to) =>
    supabase
      .from("notas_distribuidas")
      .select(
        "numero, chave_acesso, direcao, cancelada, motivo_cancelamento, data_emissao, competencia, bate_competencia, prestador_cnpj, prestador_nome, tomador_cnpj, tomador_nome, descricao_servico, local_incidencia, codigo_trib_nacional, codigo_nbs, aliquota_issqn, valor_servico, valor_issqn, valor_pis, valor_cofins, valor_ret_cp, valor_ret_irrf, valor_ret_csll",
      )
      .eq("company_id", companyId)
      .gte("competencia", `${competencia}-01`)
      .lt("competencia", primeiroDiaMesSeguinte(competencia))
      .order("data_emissao", { ascending: true })
      .range(from, to),
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SOMA Gestão";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Notas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Número", key: "numero", width: 12 },
    { header: "Direção", key: "direcao", width: 14 },
    { header: "Cancelada", key: "cancelada", width: 10 },
    { header: "Motivo cancelamento", key: "motivo_cancelamento", width: 24 },
    { header: "Data emissão", key: "data_emissao", width: 18 },
    { header: "Competência", key: "competencia", width: 12 },
    { header: "Bate competência", key: "bate_competencia", width: 14 },
    { header: "CNPJ prestador", key: "prestador_cnpj", width: 18 },
    { header: "Prestador", key: "prestador_nome", width: 28 },
    { header: "CNPJ/CPF tomador", key: "tomador_cnpj", width: 18 },
    { header: "Tomador", key: "tomador_nome", width: 28 },
    { header: "Descrição do serviço", key: "descricao_servico", width: 40 },
    { header: "Local de incidência", key: "local_incidencia", width: 16 },
    { header: "Código trib. nacional", key: "codigo_trib_nacional", width: 16 },
    { header: "Código NBS", key: "codigo_nbs", width: 12 },
    { header: "Alíquota ISSQN", key: "aliquota_issqn", width: 12, style: { numFmt: "0.00%" } },
    { header: "Valor serviço", key: "valor_servico", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Valor ISSQN", key: "valor_issqn", width: 14, style: { numFmt: "R$ #,##0.00" } },
    { header: "Valor PIS", key: "valor_pis", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Valor COFINS", key: "valor_cofins", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Retenção CP", key: "valor_ret_cp", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Retenção IRRF", key: "valor_ret_irrf", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Retenção CSLL", key: "valor_ret_csll", width: 12, style: { numFmt: "R$ #,##0.00" } },
    { header: "Chave de acesso", key: "chave_acesso", width: 48 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 26;

  for (const n of notas) {
    ws.addRow({
      ...n,
      direcao: DIRECAO_LABELS[n.direcao],
      cancelada: n.cancelada ? "Sim" : "Não",
      bate_competencia: n.bate_competencia ? "Sim" : "Não",
      data_emissao: n.data_emissao ? new Date(n.data_emissao).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
      aliquota_issqn: n.aliquota_issqn != null ? n.aliquota_issqn / 100 : null,
    });
  }

  ws.autoFilter = { from: "A1", to: `X${notas.length + 1}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
