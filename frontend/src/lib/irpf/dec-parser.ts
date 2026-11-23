// Leitor do arquivo .DEC (e do .REC) gravado pelo programa do IRPF (PGD da
// Receita). Arquivo texto de largura fixa, uma linha por registro, os dois
// primeiros caracteres dizem o tipo do registro. Posições conforme o
// "Leiaute DIRPF" publicado pela Receita (documentos técnicos). Os registros
// crescem de um ano para outro só no final, por isso as posições abaixo
// valem para vários exercícios (conferido de 2022 a 2026).
//
// Função pura, sem dependências: roda no navegador (pré-visualização da
// importação) e no servidor (gravação).

export type ResultadoImposto = "SEM_SALDO" | "PAGAR" | "RESTITUIR";

export type FontePagadora = {
  documento: string; // CNPJ/CPF da fonte (só dígitos)
  nome: string;
  rendimento: number;
  previdencia: number;
  decimoTerceiro: number;
  impostoRetido: number;
};

export type Dependente = {
  codigo: string; // código da relação de dependência
  nome: string;
  nascimento: string | null; // AAAA-MM-DD
};

export type Pagamento = {
  codigo: string; // código do pagamento (10 = médico, 26 = plano de saúde, 01 = instrução...)
  beneficiarioDocumento: string;
  beneficiario: string;
  valor: number;
  parcelaNaoDedutivel: number;
};

export type BemDireito = {
  grupo: string | null;
  codigo: string;
  descricao: string;
  valorAnterior: number;
  valorAtual: number;
};

export type Divida = {
  codigo: string;
  descricao: string;
  valorAnterior: number;
  valorAtual: number;
};

/** Dados cadastrais da ficha Identificação (registro 16). */
export type CadastroDeclarante = {
  tipoLogradouro: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  municipio: string | null;
  municipioCodigoRfb: string | null;
  uf: string | null;
  tituloEleitor: string | null;
  ocupacaoCodigo: string | null;
  naturezaOcupacaoCodigo: string | null;
  temConjuge: boolean;
  cpfConjuge: string | null;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  contaDv: string | null;
  tipoConta: string | null; // 1 corrente, 2 poupança, 3 pagamento, 4 Pix (chave CPF)
  doencaGrave: boolean;
  celular: string | null;
  telefoneFixo: string | null;
};

export type ResumoDeclaracao = {
  exercicio: number;
  anoCalendario: number;
  cpf: string;
  nome: string;
  uf: string | null;
  nascimento: string | null; // AAAA-MM-DD
  email: string | null;
  telefone: string | null;
  retificadora: boolean;
  completa: boolean; // true = deduções legais; false = desconto simplificado
  resultado: ResultadoImposto;
  numeroRecibo: string | null; // 10 dígitos gravados pelo PGD após a transmissão
  numeroReciboAnterior: string | null; // última declaração do exercício anterior
  ocupacao: string | null;
  naturezaOcupacao: string | null;
  totais: {
    rendimentosTributaveis: number;
    rendimentosIsentos: number;
    rendimentosExclusivos: number;
    deducoes: number; // desconto simplificado ou total das deduções legais
    baseCalculo: number;
    impostoDevido: number;
    impostoPago: number; // retido na fonte + carnê-leão + complementar
    impostoRestituir: number;
    impostoPagar: number;
    quotas: number;
    valorQuota: number;
    aliquotaEfetiva: number; // percentual
    bensAnterior: number;
    bensAtual: number;
    dividasAnterior: number;
    dividasAtual: number;
    // Só na completa (zero na simplificada):
    previdenciaOficial: number;
    dependentes: number;
    instrucao: number;
    medicas: number;
    pensao: number;
    livroCaixa: number;
    carneLeao: number;
  };
  fontes: FontePagadora[];
  dependentes: Dependente[];
  pagamentos: Pagamento[];
  bens: BemDireito[];
  dividas: Divida[];
  transmissao: { data: string; hora: string } | null; // do .REC
  cadastro: CadastroDeclarante;
};

export class DecInvalidoError extends Error {}

/** Campo de texto: posições 1-based e inclusivas, como no leiaute. */
function txt(linha: string, ini: number, fim: number): string {
  return linha.slice(ini - 1, fim).trim();
}

/** Campo numérico com 2 casas decimais implícitas. */
function val(linha: string, ini: number, fim: number): number {
  const s = linha.slice(ini - 1, fim).trim();
  if (!s || !/^\d+$/.test(s)) return 0;
  return Number(s) / 100;
}

function int(linha: string, ini: number, fim: number): number {
  const s = linha.slice(ini - 1, fim).trim();
  return /^\d+$/.test(s) ? Number(s) : 0;
}

function dataDDMMAAAA(s: string): string | null {
  if (!/^\d{8}$/.test(s) || s === "00000000") return null;
  return `${s.slice(4, 8)}-${s.slice(2, 4)}-${s.slice(0, 2)}`;
}

function vazioParaNull(s: string): string | null {
  return s ? s : null;
}

/** Decodifica os bytes do arquivo (o PGD grava em ISO-8859-1). */
export function decodificarArquivo(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function linhasPorTipo(texto: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const bruta of texto.split(/\r?\n/)) {
    if (bruta.length < 2) continue;
    const tipo = bruta.startsWith("IRPF") ? "IR" : bruta.slice(0, 2);
    const lista = mapa.get(tipo) ?? [];
    lista.push(bruta);
    mapa.set(tipo, lista);
  }
  return mapa;
}

export function lerDec(textoDec: string, textoRec?: string | null): ResumoDeclaracao {
  const reg = linhasPorTipo(textoDec);
  const ir = reg.get("IR")?.[0];
  const r16 = reg.get("16")?.[0];
  if (!ir || !ir.startsWith("IRPF") || !r16) {
    throw new DecInvalidoError("Não é um arquivo de declaração do IRPF (.DEC).");
  }
  // O código Receitanet (posições 17-20) muda a cada exercício (3200 em
  // 2022, 3600 em 2026), por isso não serve para filtrar o tipo.

  const completa = txt(ir, 121, 121) === "S";
  const indResultado = txt(ir, 122, 122);

  const r18 = reg.get("18")?.[0];
  const r20 = reg.get("20")?.[0];
  const r19 = reg.get("19")?.[0];
  const r17 = reg.get("17")?.[0];

  let totais: ResumoDeclaracao["totais"];
  if (completa) {
    if (!r20) throw new DecInvalidoError("Declaração completa sem o registro de totais (20).");
    totais = {
      rendimentosTributaveis: val(r20, 66, 78),
      rendimentosIsentos: val(r20, 470, 482),
      rendimentosExclusivos: val(r20, 483, 495),
      deducoes: val(r20, 183, 195),
      baseCalculo: val(r20, 196, 208),
      impostoDevido: val(r20, 274, 286),
      impostoPago: val(r20, 352, 364),
      impostoRestituir: val(r20, 365, 377),
      impostoPagar: val(r20, 378, 390),
      quotas: int(r20, 391, 391),
      valorQuota: val(r20, 392, 404),
      aliquotaEfetiva: val(r20, 886, 890),
      bensAnterior: val(r20, 405, 417),
      bensAtual: val(r20, 418, 430),
      dividasAnterior: val(r20, 431, 443),
      dividasAtual: val(r20, 444, 456),
      previdenciaOficial: val(r20, 79, 91),
      dependentes: val(r20, 105, 117),
      instrucao: val(r20, 118, 130),
      medicas: val(r20, 131, 143),
      pensao: val(r20, 144, 156) + val(r20, 157, 169),
      livroCaixa: val(r20, 170, 182),
      carneLeao: val(r20, 300, 312),
    };
  } else {
    if (!r18) throw new DecInvalidoError("Declaração simplificada sem o registro de totais (18).");
    totais = {
      rendimentosTributaveis: val(r18, 14, 26),
      rendimentosIsentos: val(r18, 158, 170),
      rendimentosExclusivos: val(r18, 171, 183),
      deducoes: val(r18, 27, 39),
      baseCalculo: val(r18, 40, 52),
      impostoDevido: val(r18, 626, 638) || val(r18, 53, 65),
      impostoPago: val(r18, 66, 78) + val(r18, 79, 91) + val(r18, 92, 104),
      impostoRestituir: val(r18, 118, 130),
      impostoPagar: val(r18, 131, 143),
      quotas: int(r18, 144, 144),
      valorQuota: val(r18, 145, 157),
      aliquotaEfetiva: val(r18, 704, 708),
      bensAnterior: val(r18, 275, 287),
      bensAtual: val(r18, 288, 300),
      dividasAnterior: val(r18, 366, 378),
      dividasAtual: val(r18, 379, 391),
      previdenciaOficial: 0,
      dependentes: 0,
      instrucao: 0,
      medicas: 0,
      pensao: 0,
      livroCaixa: 0,
      carneLeao: r17 ? val(r17, 222, 234) + val(r17, 235, 247) : 0,
    };
  }
  void r19;

  let resultado: ResultadoImposto = "SEM_SALDO";
  if (indResultado === "1" || indResultado === "3" || totais.impostoPagar > 0) resultado = "PAGAR";
  else if (indResultado === "2" || totais.impostoRestituir > 0) resultado = "RESTITUIR";

  const ddd = txt(r16, 486, 487);
  const cel = txt(r16, 488, 496);
  const dddFixo = txt(r16, 348, 351);
  const fixo = txt(r16, 498, 508);
  const telefone = cel ? `${ddd}${cel}` : fixo ? `${dddFixo}${fixo}` : "";

  const fontes: FontePagadora[] = (reg.get("21") ?? []).map((l) => ({
    documento: txt(l, 14, 27),
    nome: txt(l, 28, 87),
    rendimento: val(l, 88, 100),
    previdencia: val(l, 101, 113),
    decimoTerceiro: val(l, 114, 126),
    impostoRetido: val(l, 127, 139),
  }));

  const dependentes: Dependente[] = (reg.get("25") ?? []).map((l) => ({
    codigo: txt(l, 19, 20),
    nome: txt(l, 21, 80),
    nascimento: dataDDMMAAAA(txt(l, 81, 88)),
  }));

  const pagamentos: Pagamento[] = (reg.get("26") ?? []).map((l) => ({
    codigo: txt(l, 14, 15),
    beneficiarioDocumento: txt(l, 21, 34),
    beneficiario: txt(l, 35, 94),
    valor: val(l, 106, 118),
    parcelaNaoDedutivel: val(l, 119, 131),
  }));

  const bens: BemDireito[] = (reg.get("27") ?? []).map((l) => ({
    grupo: vazioParaNull(txt(l, 1101, 1102)),
    codigo: txt(l, 14, 15),
    descricao: txt(l, 20, 531),
    valorAnterior: val(l, 532, 544),
    valorAtual: val(l, 545, 557),
  }));

  const dividas: Divida[] = (reg.get("28") ?? []).map((l) => ({
    codigo: txt(l, 14, 15),
    descricao: txt(l, 16, 527),
    valorAnterior: val(l, 528, 540),
    valorAtual: val(l, 541, 553),
  }));

  let transmissao: ResumoDeclaracao["transmissao"] = null;
  if (textoRec) {
    const rc = linhasPorTipo(textoRec).get("RC")?.[0];
    if (rc) {
      const dia = txt(rc, 17, 18), mes = txt(rc, 19, 20), ano = txt(rc, 21, 24);
      const hh = txt(rc, 25, 26), mm = txt(rc, 27, 28), ss = txt(rc, 29, 30);
      if (/^\d{8}$/.test(`${dia}${mes}${ano}`)) {
        transmissao = { data: `${ano}-${mes}-${dia}`, hora: `${hh}:${mm}:${ss}` };
      }
    }
  }

  const banco = txt(r16, 404, 406);
  const cadastro: CadastroDeclarante = {
    tipoLogradouro: vazioParaNull(txt(r16, 74, 88)),
    logradouro: vazioParaNull(txt(r16, 89, 128)),
    numero: vazioParaNull(txt(r16, 129, 134)),
    complemento: vazioParaNull(txt(r16, 135, 155)),
    bairro: vazioParaNull(txt(r16, 156, 174)),
    cep: vazioParaNull(txt(r16, 175, 183)),
    municipioCodigoRfb: vazioParaNull(txt(r16, 184, 187)),
    municipio: vazioParaNull(txt(r16, 188, 227)),
    uf: vazioParaNull(txt(r16, 228, 229)),
    tituloEleitor: vazioParaNull(txt(r16, 369, 381)),
    ocupacaoCodigo: vazioParaNull(txt(r16, 382, 384)),
    naturezaOcupacaoCodigo: vazioParaNull(txt(r16, 385, 386)),
    temConjuge: txt(r16, 497, 497) === "S",
    cpfConjuge: /^\d{11}$/.test(txt(r16, 337, 347)) ? txt(r16, 337, 347) : null,
    banco: Number(banco) > 0 ? banco : null,
    agencia: Number(banco) > 0 ? vazioParaNull(txt(r16, 407, 410)) : null,
    conta: vazioParaNull(txt(r16, 510, 529)),
    contaDv: vazioParaNull(txt(r16, 426, 427)),
    tipoConta: /^[1-9]$/.test(txt(r16, 509, 509)) ? txt(r16, 509, 509) : null,
    doencaGrave: txt(r16, 411, 411) === "S",
    celular: cel ? `${ddd}${cel}`.replace(/\D/g, "") : null,
    telefoneFixo: fixo ? `${dddFixo}${fixo}`.replace(/\D/g, "") : null,
  };

  const recibo = txt(ir, 165, 174);
  const reciboAnterior = txt(ir, 204, 213);

  return {
    exercicio: int(ir, 9, 12),
    anoCalendario: int(ir, 13, 16),
    cpf: txt(ir, 22, 32),
    nome: txt(ir, 40, 99) || txt(r16, 14, 73),
    uf: vazioParaNull(txt(ir, 100, 101)),
    nascimento: dataDDMMAAAA(txt(ir, 113, 120)),
    email: vazioParaNull(txt(r16, 236, 325).toLowerCase()),
    telefone: vazioParaNull(telefone.replace(/\D/g, "")),
    retificadora: txt(ir, 21, 21) === "1",
    completa,
    resultado,
    numeroRecibo: /^\d+$/.test(recibo) && Number(recibo) > 0 ? recibo : null,
    numeroReciboAnterior: /^\d+$/.test(reciboAnterior) && Number(reciboAnterior) > 0 ? reciboAnterior : null,
    ocupacao: vazioParaNull(txt(r16, 382, 384)),
    naturezaOcupacao: vazioParaNull(txt(r16, 385, 386)),
    totais,
    fontes,
    dependentes,
    pagamentos,
    bens,
    dividas,
    transmissao,
    cadastro,
  };
}
