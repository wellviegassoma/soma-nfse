import "server-only";
import ExcelJS from "exceljs";
import type { Company } from "@/lib/types";
import { TAX_REGIME_LABELS, ISS_TIPO_LABELS, AMBIENTE_LABELS, REGIME_ESPECIAL_LABELS } from "@/lib/types";
import { resolverIssMensal } from "@/lib/calculo-impostos";
import { formatarCnpj, formatarCpf, formatarPercentual, formatarMoeda } from "@/lib/formatters";

const COR_MARCA_LISTA = "FF1D4ED8";
const COR_CABECALHO_TEXTO_LISTA = "FFFFFFFF";

type EmpresaLista = {
  id: string;
  codigo_cliente: string | null;
  legal_name: string;
  trade_name: string | null;
  person_type: "PF" | "PJ";
  cnpj: string | null;
  cpf: string | null;
  ativa: boolean;
  tax_regime: Company["tax_regime"];
  cnae: string | null;
  municipality_name: string | null;
  municipality_ibge_code: string | null;
  state: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_zip: string | null;
  municipal_registration: string | null;
  data_abertura: string | null;
  regime_especial_tributacao: number;
  sujeito_fator_r: boolean;
  irpj_csll_apuracao_mensal: boolean;
  equiparacao_hospitalar: boolean;
  iss_tipo: Company["iss_tipo"];
  iss_aliquota_padrao: number | null;
  iss_valor_fixo_profissional: number | null;
  iss_quantidade_profissionais: number | null;
  nfse_ambiente: Company["nfse_ambiente"];
  dps_series: string;
  dps_next_number: number;
  allow_retroactive_emission: boolean;
  created_at: string;
  certificates: { expires_at: string } | { expires_at: string }[] | null;
};

function situacaoCertificado(expiresAt: string | null): string {
  if (!expiresAt) return "Sem certificado";
  return new Date(expiresAt).getTime() < Date.now() ? "Vencido" : "Válido";
}

export type FaturamentoMesLista = {
  competencia: string; // "YYYY-MM"
  faturamentoPorEmpresa: Map<string, number>;
};

// Lucro Presumido: ISS do mês pelo cadastro (percentual sobre a receita ou
// valor fixo por profissional) — sem cadastro de alíquota/valor, a planilha
// avisa em texto em vez de deixar vazio. Simples Nacional: 0 (ISS já vai
// dentro do DAS). Outros regimes: vazio.
function issPrevisto(e: EmpresaLista, receitaMes: number): number | null {
  if (e.tax_regime === "SIMPLES_NACIONAL") return 0;
  if (e.tax_regime !== "LUCRO_PRESUMIDO") return null;
  return resolverIssMensal({
    issTipo: e.iss_tipo,
    aliquotaIss: e.iss_aliquota_padrao,
    valorFixoProfissional: e.iss_valor_fixo_profissional,
    quantidadeProfissionais: e.iss_quantidade_profissionais,
    receitaMes,
  });
}

export async function gerarExcelListaEmpresas(
  empresas: EmpresaLista[],
  faturamentoMes: FaturamentoMesLista,
): Promise<Buffer> {
  const [anoComp, mesComp] = faturamentoMes.competencia.split("-");
  const rotuloComp = `${mesComp}/${anoComp}`;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SOMA Gestão";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Empresas", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Código", key: "codigo", width: 10 },
    { header: "Razão social", key: "legalName", width: 40 },
    { header: "Nome fantasia", key: "tradeName", width: 32 },
    { header: "Tipo", key: "personType", width: 10 },
    { header: "CNPJ", key: "cnpj", width: 18 },
    { header: "CPF", key: "cpf", width: 16 },
    { header: "Situação", key: "situacao", width: 10 },
    { header: "Regime tributário", key: "taxRegime", width: 20 },
    { header: "CNAE", key: "cnae", width: 12 },
    { header: "Município", key: "municipio", width: 22 },
    { header: "Código IBGE", key: "codigoIbge", width: 12 },
    { header: "UF", key: "uf", width: 6 },
    { header: "Endereço", key: "endereco", width: 36 },
    { header: "Bairro", key: "bairro", width: 20 },
    { header: "CEP", key: "cep", width: 12 },
    { header: "Inscrição municipal", key: "inscricaoMunicipal", width: 18 },
    { header: "Data de abertura", key: "dataAbertura", width: 16 },
    { header: "Regime especial de tributação", key: "regimeEspecial", width: 26 },
    { header: "Sujeito ao Fator R", key: "fatorR", width: 14 },
    { header: "IRPJ/CSLL mensal", key: "irpjCsllMensal", width: 14 },
    { header: "Equiparação hospitalar", key: "equiparacaoHospitalar", width: 16 },
    { header: "Tipo de ISS", key: "issTipo", width: 12 },
    { header: "Alíquota de ISS", key: "issAliquota", width: 12, style: { numFmt: "0.00%" } },
    { header: "ISS fixo por profissional", key: "issValorFixo", width: 16, style: { numFmt: "R$ #,##0.00" } },
    { header: "Qtd. profissionais (ISS fixo)", key: "issQtdProfissionais", width: 16 },
    { header: `Faturamento ${rotuloComp}`, key: "faturamentoMes", width: 18, style: { numFmt: "R$ #,##0.00" } },
    { header: `ISS previsto ${rotuloComp}`, key: "issPrevisto", width: 16, style: { numFmt: "R$ #,##0.00" } },
    { header: "Ambiente NFS-e", key: "nfseAmbiente", width: 14 },
    { header: "Série DPS", key: "dpsSeries", width: 10 },
    { header: "Próximo número DPS", key: "dpsNextNumber", width: 14 },
    { header: "Emissão retroativa", key: "emissaoRetroativa", width: 14 },
    { header: "Certificado digital", key: "certificado", width: 14 },
    { header: "Validade do certificado", key: "certificadoValidade", width: 16 },
    { header: "Cadastrada em", key: "createdAt", width: 16 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COR_MARCA_LISTA } };
    cell.font = { bold: true, color: { argb: COR_CABECALHO_TEXTO_LISTA } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  headerRow.height = 26;

  for (const e of empresas) {
    const certificado = Array.isArray(e.certificates) ? e.certificates[0] : e.certificates;
    ws.addRow({
      codigo: e.codigo_cliente ?? "",
      legalName: e.legal_name,
      tradeName: e.trade_name ?? "",
      personType: e.person_type === "PF" ? "Pessoa física" : "Pessoa jurídica",
      cnpj: formatarCnpj(e.cnpj) ?? "",
      cpf: formatarCpf(e.cpf) ?? "",
      situacao: e.ativa ? "Ativa" : "Inativa",
      taxRegime: e.tax_regime ? TAX_REGIME_LABELS[e.tax_regime] : "",
      cnae: e.cnae ?? "",
      municipio: e.municipality_name ?? "",
      codigoIbge: e.municipality_ibge_code ?? "",
      uf: e.state ?? "",
      endereco: [e.address_street, e.address_number, e.address_complement].filter(Boolean).join(", "),
      bairro: e.address_neighborhood ?? "",
      cep: e.address_zip ?? "",
      inscricaoMunicipal: e.municipal_registration ?? "",
      dataAbertura: e.data_abertura ?? "",
      regimeEspecial: REGIME_ESPECIAL_LABELS[e.regime_especial_tributacao] ?? "",
      fatorR: e.sujeito_fator_r ? "Sim" : "Não",
      irpjCsllMensal: e.irpj_csll_apuracao_mensal ? "Sim" : "Não",
      equiparacaoHospitalar: e.equiparacao_hospitalar ? "Sim" : "Não",
      issTipo: ISS_TIPO_LABELS[e.iss_tipo],
      issAliquota: e.iss_aliquota_padrao ?? null,
      issValorFixo: e.iss_valor_fixo_profissional ?? null,
      issQtdProfissionais: e.iss_quantidade_profissionais ?? "",
      faturamentoMes: faturamentoMes.faturamentoPorEmpresa.get(e.id) ?? 0,
      issPrevisto:
        issPrevisto(e, faturamentoMes.faturamentoPorEmpresa.get(e.id) ?? 0) ??
        (e.tax_regime === "LUCRO_PRESUMIDO" ? "Sem alíquota/ISS cadastrado" : ""),
      nfseAmbiente: AMBIENTE_LABELS[e.nfse_ambiente],
      dpsSeries: e.dps_series,
      dpsNextNumber: e.dps_next_number,
      emissaoRetroativa: e.allow_retroactive_emission ? "Sim" : "Não",
      certificado: situacaoCertificado(certificado?.expires_at ?? null),
      certificadoValidade: certificado?.expires_at
        ? new Date(certificado.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
        : "",
      createdAt: new Date(e.created_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
    });
  }

  ws.autoFilter = { from: "A1", to: `${ws.getColumn(ws.columns.length).letter}${empresas.length + 1}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

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
  linha(ws, "Equiparação hospitalar", company.equiparacao_hospitalar ? "Sim" : "Não");
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
