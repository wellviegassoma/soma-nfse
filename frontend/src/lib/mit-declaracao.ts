import type { ValoresDevidosMit } from "@/lib/calculo-impostos";

// Códigos de domínio do MIT (ENCAPURACAO314) pra Lucro Presumido —
// QualificacaoPj/TributacaoLucro/RegimePisCofins e os CodigoDebito de
// IRPJ/CSLL/PIS/COFINS. A documentação pública da Serpro só dá exemplos
// soltos, sem tabela — confirmados em 01/09/2026 direto nas apurações
// reais já encerradas de 5 clientes Lucro Presumido da SOMA (múltiplos
// períodos de 2025 e 2026, valores idênticos em todos os 5):
// https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-dctfweb/mit/
const QUALIFICACAO_PJ = 1;
const TRIBUTACAO_LUCRO_PRESUMIDO = 3;
const REGIME_PIS_COFINS_CUMULATIVO = 2;
const CODIGO_DEBITO_IRPJ = "208901";
const CODIGO_DEBITO_CSLL = "237201";
const CODIGO_DEBITO_PIS = "810902";
const CODIGO_DEBITO_COFINS = "217201";

export type DeclaracaoMitResultado = { dados: Record<string, unknown> };

// Monta o corpo do campo `dados` de MIT.ENCAPURACAO314 (ver
// apicenter.estaleiro.serpro.gov.br/.../mit/servicos/encerrar_apuracao/).
// Função pura — quem chama já rodou `calcularLucroPresumido` +
// `valoresDevidosNoPeriodoMit` antes (ver mit/declarar/route.ts). Não
// inclui `ResponsavelApuracao` — isso é preenchido no backend
// (integra-contador/main.py), que é o único lugar com acesso às env vars
// do contador responsável da SOMA.
export function montarDeclaracaoMit(params: {
  competencia: string; // "YYYY-MM"
  valoresDevidos: ValoresDevidosMit;
  transmissaoImediata: boolean;
}): DeclaracaoMitResultado {
  const { competencia, valoresDevidos, transmissaoImediata } = params;
  const [ano, mes] = competencia.split("-").map(Number);
  const { irpj, csll, pis, cofins } = valoresDevidos;

  const semMovimento = irpj === 0 && csll === 0 && pis === 0 && cofins === 0;

  let proximoId = 1;
  const debitos: Record<string, unknown> = {};
  if (irpj > 0) {
    debitos.Irpj = { ListaDebitos: [{ IdDebito: proximoId++, CodigoDebito: CODIGO_DEBITO_IRPJ, ValorDebito: irpj }] };
  }
  if (csll > 0) {
    debitos.Csll = { ListaDebitos: [{ IdDebito: proximoId++, CodigoDebito: CODIGO_DEBITO_CSLL, ValorDebito: csll }] };
  }
  if (pis > 0) {
    debitos.PisPasep = { ListaDebitos: [{ IdDebito: proximoId++, CodigoDebito: CODIGO_DEBITO_PIS, ValorDebito: pis }] };
  }
  if (cofins > 0) {
    debitos.Cofins = { ListaDebitos: [{ IdDebito: proximoId++, CodigoDebito: CODIGO_DEBITO_COFINS, ValorDebito: cofins }] };
  }

  return {
    dados: {
      PeriodoApuracao: { MesApuracao: mes, AnoApuracao: ano },
      DadosIniciais: {
        SemMovimento: semMovimento,
        QualificacaoPj: QUALIFICACAO_PJ,
        TributacaoLucro: TRIBUTACAO_LUCRO_PRESUMIDO,
        RegimePisCofins: REGIME_PIS_COFINS_CUMULATIVO,
      },
      ...(semMovimento ? {} : { Debitos: debitos }),
      TransmissaoImediata: transmissaoImediata,
    },
  };
}
