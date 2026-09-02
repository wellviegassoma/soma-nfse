import type { ValoresDevidosMit } from "@/lib/calculo-impostos";

// Códigos de domínio do MIT (ENCAPURACAO314) pra Lucro Presumido —
// QualificacaoPj/TributacaoLucro/VariacoesMonetarias/RegimePisCofins e os
// CodigoDebito de IRPJ/CSLL/PIS/COFINS. A documentação pública da Serpro
// só dá exemplos soltos, sem tabela — confirmados direto nas apurações
// reais já encerradas de clientes Lucro Presumido da SOMA (múltiplos
// períodos de 2025 e 2026, valores idênticos em todas):
// https://apicenter.estaleiro.serpro.gov.br/documentacao/api-integra-contador/pt/solucoes/integra-dctfweb/mit/
//
// `VariacoesMonetarias` foi descoberto em 01-02/09/2026: a documentação
// pública não deixa claro que é obrigatório, e só apareceu no primeiro
// teste real contra produção — a Serpro recusou o ENCAPURACAO314 com
// "[EntradaIncorreta-MIT-MSG_0003] DadosIniciais.VariacoesMonetarias:
// campo obrigatório não informado". Valor (2) confirmado direto em
// apurações reais já encerradas.
//
// `RegimePisCofins` NÃO entra no payload de envio — apesar de aparecer
// preenchido (valor 2) quando se CONSULTA uma apuração já encerrada
// (CONSAPURACAO316), é um valor que a própria Receita deriva
// automaticamente a partir de `TributacaoLucro` pra Lucro Presumido, não
// algo que se informa. Confirmado num segundo teste real: a Serpro
// recusou com "DadosIniciais.RegimePisCofins: campo não deve ser
// informado" mesmo já com VariacoesMonetarias corrigido.
const QUALIFICACAO_PJ = 1;
const TRIBUTACAO_LUCRO_PRESUMIDO = 3;
const VARIACOES_MONETARIAS = 2;
const CODIGO_DEBITO_IRPJ = "208901";
const CODIGO_DEBITO_CSLL = "237201";
const CODIGO_DEBITO_PIS = "810902";
const CODIGO_DEBITO_COFINS = "217201";

export type ResponsavelApuracao = {
  cpf: string;
  crcUf: string;
  crcNumero: string;
  telefoneDdd: string;
  telefoneNumero: string;
  email: string;
};

export type DeclaracaoMitResultado = { dados: Record<string, unknown> };

// Monta o corpo do campo `dados` de MIT.ENCAPURACAO314 (ver
// apicenter.estaleiro.serpro.gov.br/.../mit/servicos/encerrar_apuracao/).
// Função pura — quem chama já rodou `calcularLucroPresumido` +
// `valoresDevidosNoPeriodoMit` antes (ver mit/declarar/route.ts).
// `responsavelApuracao` vem da configuração única do contador responsável
// da SOMA (tabela `configuracao_contador_responsavel`, só SUPER_ADMIN
// edita) — o mesmo valor em toda empresa, não é dado da empresa cliente.
export function montarDeclaracaoMit(params: {
  competencia: string; // "YYYY-MM"
  valoresDevidos: ValoresDevidosMit;
  responsavelApuracao: ResponsavelApuracao;
  transmissaoImediata: boolean;
}): DeclaracaoMitResultado {
  const { competencia, valoresDevidos, responsavelApuracao, transmissaoImediata } = params;
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
        VariacoesMonetarias: VARIACOES_MONETARIAS,
        ResponsavelApuracao: {
          CpfResponsavel: responsavelApuracao.cpf,
          TelResponsavel: {
            Ddd: responsavelApuracao.telefoneDdd,
            NumTelefone: responsavelApuracao.telefoneNumero,
          },
          EmailResponsavel: responsavelApuracao.email,
          RegistroCrc: {
            UfRegistro: responsavelApuracao.crcUf,
            NumRegistro: responsavelApuracao.crcNumero,
          },
        },
      },
      ...(semMovimento ? {} : { Debitos: debitos }),
      // TransmissaoImediata só é aceito quando SemMovimento=true — a
      // Serpro recusa ("[EntradaIncorreta-MIT-MSG_0020] O campo
      // transmissaoImediata só deve ser enviado para apuração sem
      // movimento") se enviado junto com uma apuração com débitos.
      // Descoberto no 3º teste real contra produção (ORTOP, 02/09/2026).
      ...(semMovimento ? { TransmissaoImediata: transmissaoImediata } : {}),
    },
  };
}
