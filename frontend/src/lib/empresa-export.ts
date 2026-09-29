import "server-only";
import ExcelJS from "exceljs";
import type { Company } from "@/lib/types";
import { TAX_REGIME_LABELS, ISS_TIPO_LABELS } from "@/lib/types";
import { formatarCnpj, formatarCpf, formatarPercentual, formatarMoeda } from "@/lib/formatters";

const COR_MARCA = "FF1D4ED8";
const COR_CABECALHO_TEXTO = "FFFFFFFF";
const COR_CINZA_CLARO = "FFF3F4F6";

function linha(ws: ExcelJS.Worksheet, campo: string, valor: string | number | null | undefined) {
  const row = ws.addRow([campo, valor ?? "—"]);
  row.getCell(1).font = { bold: true };
}

export async function gerarExcelDadosEmpresa(company: Company): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SOMA Gestão";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Dados cadastrais", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 32 }, { width: 48 }];

  ws.mergeCells("A1:B1");
  const titulo = ws.getCell("A1");
  titulo.value = company.trade_name || company.legal_name;
  titulo.font = { size: 16, bold: true, color: { argb: COR_MARCA } };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:B2");
  const subtitulo = ws.getCell("A2");
  subtitulo.value = `Gerado em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
  subtitulo.font = { size: 10, color: { argb: "FF6B7280" } };

  ws.addRow([]);
  const headerRow = ws.addRow(["Campo", "Valor"]);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA } };
    cell.font = { bold: true, color: { argb: COR_CABECALHO_TEXTO } };
  });

  linha(ws, "Código do cliente", company.codigo_cliente);
  linha(ws, "Razão social", company.legal_name);
  linha(ws, "Nome fantasia", company.trade_name);
  linha(ws, "Tipo de pessoa", company.person_type === "PF" ? "Pessoa física" : "Pessoa jurídica");
  linha(ws, "CNPJ", formatarCnpj(company.cnpj));
  linha(ws, "CPF", formatarCpf(company.cpf));
  linha(ws, "Situação", company.ativa ? "Ativa" : "Inativa");
  if (!company.ativa) linha(ws, "Data de encerramento (SOMA)", company.data_encerramento_soma);
  linha(ws, "Inscrição municipal", company.municipal_registration);
  linha(ws, "Data de abertura", company.data_abertura);
  linha(ws, "CNAE", company.cnae);
  linha(ws, "Município", company.municipality_name);
  linha(ws, "Código IBGE do município", company.municipality_ibge_code);
  linha(ws, "UF", company.state);
  linha(
    ws,
    "Endereço",
    [company.address_street, company.address_number, company.address_complement]
      .filter(Boolean)
      .join(", ") || null,
  );
  linha(ws, "Bairro", company.address_neighborhood);
  linha(ws, "CEP", company.address_zip);
  linha(ws, "Regime tributário", company.tax_regime ? TAX_REGIME_LABELS[company.tax_regime] : null);
  linha(ws, "Sujeito ao Fator R", company.sujeito_fator_r ? "Sim" : "Não");
  linha(ws, "Apuração mensal de IRPJ/CSLL", company.irpj_csll_apuracao_mensal ? "Sim" : "Não");
  linha(ws, "Regime especial de tributação", company.regime_especial_tributacao);
  linha(ws, "Tipo de ISS", ISS_TIPO_LABELS[company.iss_tipo]);
  if (company.iss_tipo === "PERCENTUAL") {
    linha(ws, "Alíquota padrão de ISS", company.iss_aliquota_padrao != null ? formatarPercentual(company.iss_aliquota_padrao) : null);
  } else {
    linha(ws, "Valor fixo de ISS por profissional", company.iss_valor_fixo_profissional != null ? formatarMoeda(company.iss_valor_fixo_profissional) : null);
    linha(ws, "Quantidade de profissionais (ISS fixo)", company.iss_quantidade_profissionais);
  }
  linha(ws, "Ambiente de emissão de NFS-e", company.nfse_ambiente === "PRODUCAO" ? "Produção" : "Homologação");
  linha(ws, "Série do DPS", company.dps_series);
  linha(ws, "Próximo número do DPS", company.dps_next_number);
  linha(ws, "Permite emissão retroativa", company.allow_retroactive_emission ? "Sim" : "Não");
  linha(ws, "Cadastrada em", company.created_at);

  ws.eachRow((row, rowNumber) => {
    if (rowNumber > 4) {
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_CINZA_CLARO } };
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
