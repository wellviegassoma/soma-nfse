// Leitor dos PDFs gerados pelo programa do IRPF: "imagem da declaração" e
// "imagem do recibo" (às vezes é o que temos, sem o .DEC/.REC). Trabalha
// sobre linhas visuais já montadas pelas posições dos textos (ver
// pdf-linhas.ts); função pura, testável sem PDF.
//
// Devolve o mesmo ResumoDeclaracao do leitor de .DEC, com `origem` dizendo
// de onde veio. Do recibo sozinho só saem os totais (sem bens, fontes,
// deduções detalhadas) — `parcial: true`.
import type { CadastroDeclarante, ResumoDeclaracao } from "./dec-parser";

export type ItemPdf = { pagina: number; x: number; y: number; largura: number; texto: string };
export type CelulaPdf = { x: number; texto: string };
export type LinhaPdf = { pagina: number; y: number; celulas: CelulaPdf[]; texto: string };

export class PdfIrpfInvalidoError extends Error {}

/** Agrupa os pedaços de texto em linhas (mesma página, mesma altura) e células. */
export function montarLinhas(itens: ItemPdf[]): LinhaPdf[] {
  const ordenados = [...itens].sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const grupos: ItemPdf[][] = [];
  for (const it of ordenados) {
    const g = grupos[grupos.length - 1];
    const ultimo = g?.[g.length - 1];
    if (g && ultimo.pagina === it.pagina && Math.abs(ultimo.y - it.y) <= 2.5) g.push(it);
    else grupos.push([it]);
  }
  return grupos.map((g) => {
    g.sort((a, b) => a.x - b.x);
    const celulas: (CelulaPdf & { fim: number })[] = [];
    for (const it of g) {
      const c = celulas[celulas.length - 1];
      if (c && it.x - c.fim < 3) {
        c.texto += (it.x - c.fim > 0.5 ? " " : "") + it.texto;
        c.fim = Math.max(c.fim, it.x + it.largura);
      } else celulas.push({ x: it.x, texto: it.texto, fim: it.x + it.largura });
    }
    const limpas = celulas.map((c) => ({ x: c.x, texto: c.texto.replace(/\s+/g, " ").trim() })).filter((c) => c.texto);
    return { pagina: g[0].pagina, y: g[0].y, celulas: limpas, texto: limpas.map((c) => c.texto).join(" ") };
  });
}

// ------------------------------------------------------------- utilitários

const RE_NUM = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;

export function numeroBr(s: string): number {
  return Number(s.replace(/\./g, "").replace(",", "."));
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Índice da primeira linha (a partir de `de`) cujo texto casa com o padrão. */
function achar(linhas: LinhaPdf[], re: RegExp, de = 0, ate = linhas.length): number {
  for (let i = de; i < ate; i++) if (re.test(semAcento(linhas[i].texto))) return i;
  return -1;
}

function idxCelula(l: LinhaPdf, re: RegExp): number {
  return l.celulas.findIndex((c) => re.test(semAcento(c.texto)));
}

/** Primeiro número depois do rótulo, na mesma linha (antes do próximo rótulo). */
function numeroApos(linhas: LinhaPdf[], re: RegExp, de = 0, ate = linhas.length): number | null {
  for (let i = de; i < ate; i++) {
    const l = linhas[i];
    const k = idxCelula(l, re);
    if (k < 0) continue;
    const prox = l.celulas[k + 1];
    if (prox && RE_NUM.test(prox.texto)) return numeroBr(prox.texto);
    // valor colado no rótulo na mesma célula ("Imposto pago no exterior 0,00")
    const m = l.celulas[k].texto.match(/(-?\d{1,3}(?:\.\d{3})*,\d{2})$/);
    if (m) return numeroBr(m[1]);
    // Valor desalinhado alguns pontos acima/abaixo do rótulo (recibo do e-CAC):
    // linha vizinha que tem só um número.
    for (const j of [i - 1, i + 1]) {
      const v = linhas[j];
      if (v && v.pagina === l.pagina && Math.abs(v.y - l.y) <= 6 && v.celulas.length === 1 && RE_NUM.test(v.celulas[0].texto)) {
        return numeroBr(v.celulas[0].texto);
      }
    }
    return 0;
  }
  return null;
}

/** Texto da célula logo depois do rótulo ("Endereço:" → "RUA X"), se não for outro rótulo. */
function textoApos(linhas: LinhaPdf[], re: RegExp, de = 0, ate = linhas.length): string | null {
  for (let i = de; i < ate; i++) {
    const l = linhas[i];
    const k = idxCelula(l, re);
    if (k < 0) continue;
    const prox = l.celulas[k + 1];
    if (!prox || /:\s*$/.test(prox.texto)) return null;
    return prox.texto;
  }
  return null;
}

function data(s: string | null): string | null {
  const m = s?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const soDigitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function cabecalho(linhas: LinhaPdf[]) {
  const topo = linhas.slice(0, 40).map((l) => semAcento(l.texto)).join(" ");
  const ex = topo.match(/EXERCICIO (\d{4})/);
  const ac = topo.match(/ANO-CALENDARIO (\d{4})/);
  if (!ex || !ac || !/IMPOSTO SOBRE A RENDA - PESSOA FISICA/.test(topo)) {
    throw new PdfIrpfInvalidoError("Não parece um PDF do programa do IRPF (declaração ou recibo).");
  }
  return { exercicio: Number(ex[1]), anoCalendario: Number(ac[1]) };
}

function totaisVazios(): ResumoDeclaracao["totais"] {
  return {
    rendimentosTributaveis: 0, rendimentosIsentos: 0, rendimentosExclusivos: 0, deducoes: 0, baseCalculo: 0,
    impostoDevido: 0, impostoPago: 0, impostoRestituir: 0, impostoPagar: 0, quotas: 0, valorQuota: 0,
    aliquotaEfetiva: 0, bensAnterior: 0, bensAtual: 0, dividasAnterior: 0, dividasAtual: 0,
    previdenciaOficial: 0, dependentes: 0, instrucao: 0, medicas: 0, pensao: 0, livroCaixa: 0, carneLeao: 0,
  };
}

function cadastroVazio(): CadastroDeclarante {
  return {
    tipoLogradouro: null, logradouro: null, numero: null, complemento: null, bairro: null, cep: null,
    municipio: null, municipioCodigoRfb: null, uf: null, tituloEleitor: null, ocupacaoCodigo: null,
    naturezaOcupacaoCodigo: null, temConjuge: false, cpfConjuge: null, banco: null, agencia: null, conta: null,
    contaDv: null, tipoConta: null, doencaGrave: false, celular: null, telefoneFixo: null,
  };
}

// ------------------------------------------------------------- recibo

export type ReciboPdf = {
  exercicio: number;
  anoCalendario: number;
  cpf: string;
  nome: string;
  retificadora: boolean;
  completa: boolean;
  numeroRecibo: string; // 10 primeiros dígitos (como no .DEC)
  transmissao: { data: string; hora: string } | null;
  rendimentosTributaveis: number;
  impostoDevido: number;
  impostoRestituir: number;
  impostoPagar: number;
  quotas: number;
  valorQuota: number;
};

export function lerReciboPdf(linhas: LinhaPdf[]): ReciboPdf {
  const cab = cabecalho(linhas);
  const tudo = semAcento(linhas.map((l) => l.texto).join("\n"));
  if (!/RECIBO DE ENTREGA DA DECLARACAO/.test(tudo)) throw new PdfIrpfInvalidoError("Este PDF não é o recibo de entrega.");
  const cpf = soDigitos(tudo.match(/inscrito no CPF sob o n[ºo°]? ?([\d.-]+)/)?.[1] ?? tudo.match(/(\d{3}\.\d{3}\.\d{3}-\d{2})/)?.[1]);
  const nome = (linhas.map((l) => l.texto).join("\n").match(/Sr\(a\) (.+?), inscrito no CPF/)?.[1] ?? "").trim();
  const reciboM = tudo.match(/(\d{2})\.(\d{2})\.(\d{2})\.(\d{2})\.(\d{2}) ?- ?(\d{2})/);
  const quando = tudo.match(/apresentada em (\d{2}\/\d{2}\/\d{4}), as (\d{2}:\d{2}:\d{2})/);
  if (cpf.length !== 11 || !reciboM) throw new PdfIrpfInvalidoError("Não achei o CPF ou o número do recibo no PDF.");

  const n = (re: RegExp) => numeroApos(linhas, re) ?? 0;
  const quotasTxt = textoApos(linhas, /^NUMERO DE QUOTAS$/);
  return {
    ...cab,
    cpf,
    nome,
    retificadora: /DECLARACAO RETIFICADORA/.test(tudo),
    completa: /OPCAO PELAS DEDUCOES LEGAIS/.test(tudo),
    numeroRecibo: reciboM.slice(1, 6).join(""),
    transmissao: quando ? { data: data(quando[1])!, hora: quando[2] } : null,
    rendimentosTributaveis: n(/^TOTAL RENDIMENTOS TRIBUTAVEIS/),
    impostoDevido: n(/^IMPOSTO DEVIDO/),
    impostoRestituir: n(/^IMPOSTO A RESTITUIR/),
    impostoPagar: n(/^SALDO DO IMPOSTO A PAGAR/),
    quotas: quotasTxt && /^\d{1,2}$/.test(quotasTxt) ? Number(quotasTxt) : 0,
    valorQuota: n(/^VALOR DA QUOTA$/),
  };
}

/** Resumo só com o que o recibo traz (sem bens, fontes nem deduções). */
export function resumoDoRecibo(r: ReciboPdf): ResumoDeclaracao {
  const totais = totaisVazios();
  Object.assign(totais, {
    rendimentosTributaveis: r.rendimentosTributaveis,
    impostoDevido: r.impostoDevido,
    impostoRestituir: r.impostoRestituir,
    impostoPagar: r.impostoPagar,
    quotas: r.impostoPagar > 0 ? r.quotas || 1 : 0,
    valorQuota: r.valorQuota,
  });
  return {
    exercicio: r.exercicio,
    anoCalendario: r.anoCalendario,
    cpf: r.cpf,
    nome: r.nome,
    uf: null,
    nascimento: null,
    email: null,
    telefone: null,
    retificadora: r.retificadora,
    completa: r.completa,
    resultado: r.impostoPagar > 0 ? "PAGAR" : r.impostoRestituir > 0 ? "RESTITUIR" : "SEM_SALDO",
    numeroRecibo: r.numeroRecibo,
    numeroReciboAnterior: null,
    ocupacao: null,
    naturezaOcupacao: null,
    totais,
    fontes: [],
    dependentes: [],
    pagamentos: [],
    bens: [],
    dividas: [],
    transmissao: r.transmissao,
    cadastro: cadastroVazio(),
    origem: "RECIBO_PDF",
    parcial: true,
  };
}

// ------------------------------------------------------------- declaração

export function lerDeclaracaoPdf(linhas: LinhaPdf[]): ResumoDeclaracao {
  const cab = cabecalho(linhas);
  const idxIdent = achar(linhas, /^IDENTIFICACAO DO CONTRIBUINTE/);
  const idxResumo = achar(linhas, /^RESUMO\b/);
  if (idxIdent < 0 || idxResumo < 0) {
    throw new PdfIrpfInvalidoError("Este PDF não é a declaração completa (faltam Identificação ou Resumo).");
  }
  const idxDep = achar(linhas, /^DEPENDENTES\b/, idxIdent);
  const fimIdent = idxDep > 0 ? idxDep : idxIdent + 40;
  const t = (re: RegExp) => textoApos(linhas, re, idxIdent, fimIdent);

  const cpf = soDigitos(t(/^CPF:$/));
  const nome = t(/^Nome:$/) ?? "";
  if (cpf.length !== 11) throw new PdfIrpfInvalidoError("Não achei o CPF do contribuinte no PDF.");
  const tipoLinha = linhas[achar(linhas, /Tipo de declaracao:/, idxIdent, fimIdent)]?.texto ?? "";
  const conjLinha = linhas[achar(linhas, /Possui conjuge/, idxIdent, fimIdent)]?.texto ?? "";
  const doencaLinha = linhas[achar(linhas, /doenca grave/i, idxIdent, fimIdent)]?.texto ?? "";
  const reciboAntLinha = linhas[achar(linhas, /recibo da ultima declaracao/, idxIdent, fimIdent)]?.texto ?? "";
  const codigo = (s: string | null) => s?.match(/^(\d{2,3})\s*-/)?.[1] ?? null;
  const fone = (s: string | null) => soDigitos(s) || null;
  const endereco = t(/^Endereco:$/);

  const cadastro: CadastroDeclarante = {
    ...cadastroVazio(),
    logradouro: endereco,
    numero: t(/^Numero:$/),
    complemento: t(/^Complemento:$/),
    bairro: t(/^Bairro\/Distrito:$/),
    municipio: t(/^Municipio:$/),
    uf: t(/^UF:$/),
    cep: soDigitos(t(/^CEP:$/)) || null,
    naturezaOcupacaoCodigo: codigo(t(/^Natureza da Ocupacao:$/)),
    ocupacaoCodigo: codigo(t(/^Ocupacao Principal:$/)),
    temConjuge: /\?\s*Sim\b/.test(conjLinha),
    cpfConjuge: (() => {
      // Às vezes o valor sai na mesma célula do rótulo ("CPF do cônjuge...: 000.000.000-00").
      const i = achar(linhas, /CPF do conjuge/, idxIdent, fimIdent);
      const m = i >= 0 ? linhas[i].texto.match(/CPF do c\S+ ou companheiro\(a\):?\s*(\d{3}\.\d{3}\.\d{3}-\d{2})/) : null;
      return m ? soDigitos(m[1]) : null;
    })(),
    doencaGrave: /\?\s*Sim\b/.test(doencaLinha),
    celular: fone(t(/^DDD\/Celular:$/)),
    telefoneFixo: fone(t(/^DDD\/Telefone:$/)),
  };

  // Seções com listas.
  const secao = (re: RegExp, de = 0) => {
    const ini = achar(linhas, re, de);
    return ini;
  };
  const dependentes: ResumoDeclaracao["dependentes"] = [];
  if (idxDep > 0) {
    const fim = achar(linhas, /TOTAL DE DEDUCAO COM DEPENDENTES|^ALIMENTANDOS/, idxDep);
    for (let i = idxDep + 1; i < (fim > 0 ? fim : idxDep + 60); i++) {
      const c = linhas[i].celulas;
      const k = c.findIndex((x) => /^\d{2}$/.test(x.texto));
      if (k >= 0 && c[k + 1] && /^[A-ZÀ-Ú' ]{3,}$/.test(c[k + 1].texto)) {
        const d = c.find((x) => /^\d{2}\/\d{2}\/\d{4}$/.test(x.texto));
        dependentes.push({ codigo: c[k].texto, nome: c[k + 1].texto, nascimento: data(d?.texto ?? null) });
      }
    }
  }

  const fontes: ResumoDeclaracao["fontes"] = [];
  let iF = secao(/^RENDIMENTOS TRIBUTAVEIS RECEBIDOS DE PESSOA JURIDICA PELO TITULAR/);
  // A seção termina no próximo título de rendimentos (o cabeçalho dela se repete
  // nas páginas seguintes e é ignorado) ou em Pagamentos.
  const fimF = (() => {
    for (let i = iF + 1; iF >= 0 && i < linhas.length; i++) {
      const tx = semAcento(linhas[i].texto);
      if (/^RENDIMENTOS TRIBUTAVEIS RECEBIDOS DE PESSOA JURIDICA PELO TITULAR/.test(tx)) continue;
      if (/^RENDIMENTOS |^PAGAMENTOS EFETUADOS|^DECLARACAO DE BENS/.test(tx)) return i;
    }
    return -1;
  })();
  if (iF >= 0) {
    for (iF++; iF < (fimF > 0 ? fimF : linhas.length); iF++) {
      const c = linhas[iF].celulas;
      const nums = c.filter((x) => RE_NUM.test(x.texto)).map((x) => numeroBr(x.texto));
      if (c.length && !RE_NUM.test(c[0].texto) && nums.length >= 4 && !/^TOTAL$/.test(c[0].texto)) {
        const doc = linhas.slice(iF + 1, iF + 5).find((l) => /CNPJ\/CPF:/.test(l.texto))?.texto ?? "";
        fontes.push({
          nome: c[0].texto,
          documento: soDigitos(doc.match(/CNPJ\/CPF:\s*([\d./-]+)/)?.[1]),
          rendimento: nums[0],
          previdencia: nums[1],
          impostoRetido: nums[2],
          decimoTerceiro: nums[3],
        });
      }
    }
  }

  const pagamentos: ResumoDeclaracao["pagamentos"] = [];
  let iP = secao(/^PAGAMENTOS EFETUADOS/);
  const fimP = secao(/^DOACOES EFETUADAS|^DECLARACAO DE BENS E DIREITOS/, iP > 0 ? iP : 0);
  if (iP >= 0) {
    for (iP++; iP < (fimP > 0 ? fimP : linhas.length); iP++) {
      const c = linhas[iP].celulas;
      if (c.length >= 3 && /^\d{2}$/.test(c[0].texto)) {
        const nums = c.filter((x) => RE_NUM.test(x.texto)).map((x) => numeroBr(x.texto));
        if (nums.length >= 2) {
          const doc = c.find((x) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(x.texto));
          pagamentos.push({
            codigo: c[0].texto,
            beneficiario: c[1].texto,
            beneficiarioDocumento: soDigitos(doc?.texto),
            valor: nums[nums.length - 2],
            parcelaNaoDedutivel: nums[nums.length - 1],
          });
        }
      }
    }
  }

  const bens: ResumoDeclaracao["bens"] = [];
  let iB = secao(/^DECLARACAO DE BENS E DIREITOS/);
  const fimB = secao(/^DIVIDAS E ONUS REAIS/, iB > 0 ? iB : 0);
  if (iB >= 0) {
    for (iB++; iB < (fimB > 0 ? fimB : linhas.length); iB++) {
      const c = linhas[iB].celulas;
      if (c.length >= 4 && /^\d{2}$/.test(c[0].texto) && /^\d{2}$/.test(c[1].texto)) {
        const nums = c.filter((x) => RE_NUM.test(x.texto)).map((x) => numeroBr(x.texto));
        if (nums.length >= 2) {
          const desc = c.slice(2).filter((x) => !RE_NUM.test(x.texto)).map((x) => x.texto).join(" ");
          bens.push({ grupo: c[0].texto, codigo: c[1].texto, descricao: desc, valorAnterior: nums[0], valorAtual: nums[1] });
        }
      }
    }
  }

  const dividas: ResumoDeclaracao["dividas"] = [];
  let iD = fimB;
  const fimD = iD > 0 ? secao(/^DOACOES A PARTIDOS|^RESUMO\b|^ESPOLIO|^GANHOS DE CAPITAL/, iD + 1) : -1;
  if (iD > 0) {
    for (iD++; iD < (fimD > 0 ? fimD : idxResumo); iD++) {
      const c = linhas[iD].celulas;
      if (c.length >= 3 && /^\d{2}$/.test(c[0].texto)) {
        const nums = c.filter((x) => RE_NUM.test(x.texto)).map((x) => numeroBr(x.texto));
        if (nums.length >= 2) {
          const desc = c.slice(1).filter((x) => !RE_NUM.test(x.texto)).map((x) => x.texto).join(" ");
          dividas.push({ codigo: c[0].texto, descricao: desc, valorAnterior: nums[0], valorAtual: nums[1] });
        }
      }
    }
  }

  // RESUMO (e páginas seguintes: evolução patrimonial / outras informações).
  const R = idxResumo;
  const n = (re: RegExp) => numeroApos(linhas, re, R) ?? 0;
  const resumoTexto = semAcento(linhas.slice(R, R + 3).map((l) => l.texto).join(" "));
  const completa = !/DESCONTO SIMPLIFICADO/.test(resumoTexto);
  const bensLinhas = linhas
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i > R && /^Bens e direitos em \d{2}\/\d{2}\/\d{4}/.test(semAcento(l.texto)));
  const dividasLinhas = linhas
    .map((l, i) => ({ l, i }))
    .filter(({ l, i }) => i > R && /^Dividas e onus reais em \d{2}\/\d{2}\/\d{4}/.test(semAcento(l.texto)));
  const valorDaLinha = (l: LinhaPdf) => {
    const x = l.celulas.find((c) => RE_NUM.test(c.texto));
    return x ? numeroBr(x.texto) : 0;
  };
  const porAno = (arr: { l: LinhaPdf }[], ano: number) => {
    const a = arr.find(({ l }) => l.texto.includes(`/${ano}`));
    return a ? valorDaLinha(a.l) : 0;
  };

  // "TOTAL" logo abaixo do título da seção (Rendimentos / Deduções).
  const totalDaSecao = (titulo: RegExp) => {
    const i = achar(linhas, titulo, R);
    return i >= 0 ? numeroApos(linhas, /^TOTAL$/, i + 1) ?? 0 : 0;
  };
  const totais = totaisVazios();
  Object.assign(totais, {
    rendimentosTributaveis: completa
      ? totalDaSecao(/^RENDIMENTOS TRIBUTAVEIS$/)
      : n(/^TOTAL DE RENDIMENTOS TRIBUTAVEIS$/),
    deducoes: completa ? totalDaSecao(/^DEDUCOES$/) : n(/^Desconto simplificado$/i),
    baseCalculo: n(/^Base de calculo do imposto$/i),
    impostoDevido: n(/^Total do imposto devido$/),
    impostoPago: n(/^Total do imposto pago$/),
    impostoRestituir: n(/^IMPOSTO A RESTITUIR$/),
    impostoPagar: n(/^SALDO (DE )?IMPOSTO A PAGAR$/),
    valorQuota: n(/^Valor da quota$/),
    quotas: (() => {
      // Célula do rótulo pode estar no meio da linha (linhas a 2pt de distância se juntam).
      for (let i = R; i < linhas.length; i++) {
        const k = idxCelula(linhas[i], /^Numero de Quotas$/i);
        if (k < 0) continue;
        const v = linhas[i].celulas[k + 1]?.texto ?? "";
        return /^\d{1,2}$/.test(v) ? Number(v) : 0;
      }
      return 0;
    })(),
    aliquotaEfetiva: n(/^Aliquota efetiva/),
    rendimentosIsentos: n(/^Rendimentos isentos e nao tributaveis$/),
    rendimentosExclusivos: n(/^Rendimentos sujeitos a tributacao exclusiva/),
    bensAnterior: porAno(bensLinhas, cab.anoCalendario - 1),
    bensAtual: porAno(bensLinhas, cab.anoCalendario),
    dividasAnterior: porAno(dividasLinhas, cab.anoCalendario - 1),
    dividasAtual: porAno(dividasLinhas, cab.anoCalendario),
    previdenciaOficial: completa ? n(/^Contribuicoes as previdencias oficial/) : 0,
    dependentes: completa ? n(/^Dependentes$/) : 0,
    instrucao: completa ? n(/^Despesas com instrucao$/) : 0,
    medicas: completa ? n(/^Despesas medicas$/) : 0,
    pensao: completa ? n(/^Pensao alimenticia judicial$/) + n(/^Pensao alimenticia por escritura publica/) : 0,
    livroCaixa: completa ? n(/^Livro caixa$/) : 0,
    carneLeao: n(/^Carne-Leao do titular/) + n(/^Carne-Leao dos dependentes/),
  });

  return {
    exercicio: cab.exercicio,
    anoCalendario: cab.anoCalendario,
    cpf,
    nome,
    uf: cadastro.uf,
    nascimento: data(t(/^Data de Nascimento:$/)),
    email: (t(/^E-mail:$/) ?? "").toLowerCase() || null,
    telefone: cadastro.celular ?? cadastro.telefoneFixo,
    retificadora: /Retificadora/i.test(tipoLinha),
    completa,
    resultado: totais.impostoPagar > 0 ? "PAGAR" : totais.impostoRestituir > 0 ? "RESTITUIR" : "SEM_SALDO",
    numeroRecibo: null,
    numeroReciboAnterior: soDigitos(reciboAntLinha.match(/([\d.]{14})\s*-\s*\d{2}\s*$/)?.[1]) || null,
    ocupacao: cadastro.ocupacaoCodigo,
    naturezaOcupacao: cadastro.naturezaOcupacaoCodigo,
    totais,
    fontes,
    dependentes,
    pagamentos,
    bens,
    dividas,
    transmissao: null,
    cadastro,
    origem: "DECLARACAO_PDF",
  };
}

/** Junta declaração (PDF) + recibo (PDF): o recibo dá número e data de entrega. */
export function juntarDeclaracaoRecibo(decl: ResumoDeclaracao, recibo: ReciboPdf | null): ResumoDeclaracao {
  if (!recibo) return decl;
  if (recibo.cpf !== decl.cpf || recibo.exercicio !== decl.exercicio) {
    throw new PdfIrpfInvalidoError("O recibo é de outro CPF ou exercício que a declaração.");
  }
  // Declaração impressa de outra versão (ex.: rascunho antes da transmissão).
  const t = decl.totais;
  const difere = (a: number, b: number) => Math.abs(a - b) > 0.01;
  if (difere(t.impostoDevido, recibo.impostoDevido) || difere(t.impostoPagar, recibo.impostoPagar) || difere(t.impostoRestituir, recibo.impostoRestituir)) {
    throw new PdfIrpfInvalidoError(
      "A declaração em PDF não bate com o recibo (imposto devido ou saldo diferentes) — parece ser de outra versão. Importe só o recibo ou o PDF da versão transmitida.",
    );
  }
  return { ...decl, numeroRecibo: recibo.numeroRecibo, transmissao: recibo.transmissao, retificadora: recibo.retificadora };
}
