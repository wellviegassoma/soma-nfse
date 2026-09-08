// Régua de cobrança: decide qual etapa cabe a cada conta a receber hoje e
// monta o texto. Funções puras — a decisão de "quem cobrar e com que mensagem"
// é a parte que, se errar, manda a cobrança errada pro cliente certo.

export type CanalCobranca = "EMAIL" | "WHATSAPP" | "TELEFONE" | "OUTRO";

export const CANAL_LABELS: Record<CanalCobranca, string> = {
  EMAIL: "E-mail",
  WHATSAPP: "WhatsApp",
  TELEFONE: "Telefone",
  OUTRO: "Outro",
};

export const CANAIS: CanalCobranca[] = ["EMAIL", "WHATSAPP", "TELEFONE", "OUTRO"];

export type EtapaCobranca = {
  id: string;
  nome: string;
  diasRelativos: number;
  canal: CanalCobranca;
  template: string;
  ativa: boolean;
};

export type ContaCobranca = {
  agendamentoId: string;
  descricao: string | null;
  vencimento: string; // YYYY-MM-DD
  emAberto: number;
  contatoNome: string | null;
  /** ids das etapas já registradas para esta conta */
  etapasJaEnviadas: Set<string>;
};

export type EtapaDevida = {
  etapa: EtapaCobranca;
  diasAtraso: number;
  texto: string;
};

/** Dias entre duas datas YYYY-MM-DD, em UTC pra não escorregar por fuso. */
export function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(
    Number(de.slice(0, 4)),
    Number(de.slice(5, 7)) - 1,
    Number(de.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(ate.slice(0, 4)),
    Number(ate.slice(5, 7)) - 1,
    Number(ate.slice(8, 10)),
  );
  return Math.round((b - a) / 86400000);
}

function formatarBRL(valor: number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarDataBr(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function montarTexto(
  template: string,
  dados: {
    cliente: string | null;
    valor: number;
    vencimento: string;
    descricao: string | null;
    diasAtraso: number;
    empresa: string;
  },
): string {
  return template
    .replaceAll("{cliente}", dados.cliente ?? "cliente")
    .replaceAll("{valor}", formatarBRL(dados.valor))
    .replaceAll("{vencimento}", formatarDataBr(dados.vencimento))
    .replaceAll("{descricao}", dados.descricao ?? "a cobrança em aberto")
    .replaceAll("{dias_atraso}", String(Math.max(0, dados.diasAtraso)))
    .replaceAll("{empresa}", dados.empresa);
}

/**
 * Qual etapa da régua está devida hoje para esta conta.
 *
 * Devolve NO MÁXIMO UMA etapa, e a régua só anda pra frente. Duas regras que
 * parecem detalhe e não são:
 *
 * 1. Conta 20 dias atrasada sem nenhuma cobrança recebe o aviso de 15 dias, e
 *    não os quatro avisos de uma vez.
 * 2. Etapa anterior à última já enviada NÃO volta. Sem isso, depois de mandar
 *    o aviso de 7 dias o sistema mandaria o de 3 no dia seguinte — a cobrança
 *    regrediria de tom e o cliente receberia um lembrete gentil depois da
 *    notificação séria. Pego em teste; era o comportamento anterior.
 *
 * Etapa pulada fica pulada mesmo: a de 3 dias, quando já se passaram 20,
 * perdeu o sentido, e registrá-la como enviada seria mentir no histórico.
 */
export function etapaDevida(
  conta: ContaCobranca,
  etapas: EtapaCobranca[],
  hoje: string,
  nomeEmpresa: string,
): EtapaDevida | null {
  const diasAtraso = diasEntre(conta.vencimento, hoje);

  // Ponto da régua onde esta conta já chegou. -Infinity quando nada foi
  // cobrado ainda, pra a primeira etapa poder entrar.
  const jaChegouEm = etapas
    .filter((e) => conta.etapasJaEnviadas.has(e.id))
    .reduce((max, e) => Math.max(max, e.diasRelativos), Number.NEGATIVE_INFINITY);

  const candidatas = etapas
    .filter((e) => e.ativa)
    .filter((e) => e.diasRelativos <= diasAtraso)
    .filter((e) => e.diasRelativos > jaChegouEm)
    .filter((e) => !conta.etapasJaEnviadas.has(e.id))
    .sort((a, b) => b.diasRelativos - a.diasRelativos);

  const etapa = candidatas[0];
  if (!etapa) return null;

  return {
    etapa,
    diasAtraso,
    texto: montarTexto(etapa.template, {
      cliente: conta.contatoNome,
      valor: conta.emAberto,
      vencimento: conta.vencimento,
      descricao: conta.descricao,
      diasAtraso,
      empresa: nomeEmpresa,
    }),
  };
}
