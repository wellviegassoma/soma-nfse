import { TAX_REGIME_LABELS, type TaxRegime } from "@/lib/types";

export type DadosEmpresaNovoCliente = {
  codigo_cliente: string | null;
  legal_name: string | null;
  cnpj: string | null;
  person_type: string | null;
  tax_regime: string | null;
  equiparacao_hospitalar: boolean | null;
  sujeito_fator_r: boolean | null;
  fase_legalizacao_atual: string | null;
  processo_concluido: boolean | null;
};

export type CamposNovoCliente = {
  inicioResponsabilidade: string; // yyyy-mm-dd ou ""
  funcionarios: string; // "" = não informado, "0" = Não
  proLabore: string;
  faseLegalizacao: string;
  obs: string;
};

const VAZIO = "—";

function dataBr(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function regimeCurto(regime: string | null) {
  if (!regime) return VAZIO;
  if (regime === "SIMPLES_NACIONAL") return "Simples";
  return TAX_REGIME_LABELS[regime as TaxRegime] ?? regime;
}

export function origemPorTipo(tipoOnboarding: string | null) {
  if (tipoOnboarding === "TRANSICAO_CONTABIL") return "Outra Contabilidade";
  if (tipoOnboarding === "ABERTURA_NOVO_CNPJ") return "Abertura";
  return null;
}

/** Sugestão quando o campo de pró-labore está vazio. */
export function proLaboreSugerido(empresa: DadosEmpresaNovoCliente | null) {
  return empresa?.sujeito_fator_r ? "Ajustar para o Fator R" : "";
}

/** Fase vinda do processo de Legalização vinculado (quando há). */
export function faseDoProcesso(empresa: DadosEmpresaNovoCliente | null) {
  if (empresa?.fase_legalizacao_atual) return empresa.fase_legalizacao_atual;
  if (empresa?.processo_concluido) return "Concluída";
  return "";
}

export function montarMensagemNovoCliente({
  empresa,
  especialidade,
  tipoOnboarding,
  campos,
}: {
  empresa: DadosEmpresaNovoCliente | null;
  especialidade: string | null;
  tipoOnboarding: string | null;
  campos: CamposNovoCliente;
}) {
  const origem = origemPorTipo(tipoOnboarding);
  const inicio = campos.inicioResponsabilidade ? dataBr(campos.inicioResponsabilidade) : VAZIO;
  const qtd = campos.funcionarios.trim();
  const funcionarios = qtd === "" ? VAZIO : Number(qtd) > 0 ? `Sim - ${Number(qtd)}` : "Não";
  const proLabore = campos.proLabore.trim() || proLaboreSugerido(empresa) || VAZIO;
  const fase = campos.faseLegalizacao.trim() || faseDoProcesso(empresa) || VAZIO;
  const equiparacao =
    empresa?.equiparacao_hospitalar == null ? VAZIO : empresa.equiparacao_hospitalar ? "Sim" : "Não";

  const linhas = [
    "NOVO CLIENTE | SOMA CONTABILIDADE",
    "",
    `📌 Código: ${empresa?.codigo_cliente || VAZIO}`,
    `🏢 Razão Social: ${empresa?.legal_name || VAZIO}`,
    `📅 Início da responsabilidade: ${inicio}${origem ? ` (${origem})` : ""}`,
    "",
    "📋 Dados da empresa",
    `* Regime Tributário: ${regimeCurto(empresa?.tax_regime ?? null)}`,
    `* Segmento: ${especialidade?.trim() || VAZIO}`,
    `* Equiparação Hospitalar: ${equiparacao}`,
    `* Funcionários: ${funcionarios}`,
    `* Pró-labore: ${proLabore}`,
    "",
    `📎 Fase atual do processo de legalização: ${fase}`,
  ];
  const obs = campos.obs.trim();
  if (obs) linhas.push("", `OBS: ${obs}`);
  return linhas.join("\n");
}

export function urlCartaoCnpjReceita(cnpj: string | null) {
  const digitos = (cnpj ?? "").replace(/\D/g, "");
  if (digitos.length !== 14) return null;
  return `https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/Cnpjreva_Solicitacao.asp?cnpj=${digitos}`;
}
