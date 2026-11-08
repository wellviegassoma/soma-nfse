import "server-only";
import { parseNumeroBr } from "./numero-br";

// Uma empresa do "Resumo da folha" (relatório "Resumo Geral" do sistema de
// folha da SOMA, gerado com todas as empresas num PDF só — um bloco de
// páginas por empresa, cabeçalho repetido em cada página).
export type ResumoFolhaEmpresa = {
  documento: string; // só dígitos: 14 (CNPJ); 11 (CPF) ou 12 (CEI) quando o empregador é pessoa física
  nome: string;
  codigoFolha: string | null; // código da empresa no sistema de folha ("Página : 00177")
  competencia: string; // "YYYY-MM" da folha
  proLabore: number; // seção Sócios/Autônomos: pró-labore + autônomos (TOTAL DE ADICIONAIS, as duas colunas)
  salarios: number; // seção Funcionários: TOTAL DE ADICIONAIS (coluna TOTAL)
  fgts: number; // FGTS Mensal + FGTS 13º + FGTS Rescisório (multa rescisória fica de fora)
  avisos: string[];
};

const NUM = String.raw`-?[\d.]+,\d{2}`;

// Cada página começa com "Empresa :" — quebra por aí em vez de depender do
// separador de página do extrator de texto.
function paginas(texto: string): string[] {
  return texto.split(/(?=^Empresa :)/m).filter((p) => p.startsWith("Empresa :"));
}

// O extrator de texto do PDF lê o "Resumo Geral" na ordem visual (testado
// com o arquivo real de 10/2026, 161 empresas / 278 páginas): as linhas
// "TOTAL DE ADICIONAIS" saem com os valores na mesma linha — 4 colunas na
// seção de funcionários (Ativos/Demitidos/Afastados/Total) e 2 na de
// sócios (Sócios/Autônomos). Os blocos de "Outras informações" saem com os
// rótulos primeiro e os valores depois, na mesma ordem dos rótulos.
export function parseResumoFolha(texto: string): ResumoFolhaEmpresa[] | null {
  const porDocumento = new Map<
    string,
    ResumoFolhaEmpresa & { totaisFunc: number; totaisSocios: number; secaoFunc: boolean; secaoSocios: boolean; fgtsLido: boolean }
  >();

  for (const p of paginas(texto)) {
    const nome = p.match(/^Empresa :\s*(.+)$/m)?.[1].trim() ?? "";
    const documento = p.match(/([\d./-]{11,18})\s+CNPJ :/)?.[1].replace(/\D/g, "") ?? "";
    const periodo = p.match(/Per[íi]odo:\s*\d{2}\/(\d{2})\/(\d{4})\s*a/);
    if (!documento || !periodo) continue;
    const competencia = `${periodo[2]}-${periodo[1]}`;
    const codigoFolha = p.match(/P[áa]gina :\s*(\d{3,})/)?.[1] ?? null;

    const chave = `${documento}|${competencia}`;
    let e = porDocumento.get(chave);
    if (!e) {
      e = {
        documento,
        nome,
        codigoFolha,
        competencia,
        proLabore: 0,
        salarios: 0,
        fgts: 0,
        avisos: [],
        totaisFunc: 0,
        totaisSocios: 0,
        secaoFunc: false,
        secaoSocios: false,
        fgtsLido: false,
      };
      porDocumento.set(chave, e);
    }

    if (/Valores pagos aos Funcion[áa]rios/.test(p)) e.secaoFunc = true;
    if (/Valores pagos aos S[óo]cios/.test(p)) e.secaoSocios = true;

    for (const m of p.matchAll(new RegExp(String.raw`^TOTAL DE ADICIONAIS((?:\s+${NUM})+)\s*$`, "gm"))) {
      const valores = m[1].trim().split(/\s+/).map(parseNumeroBr);
      if (valores.length === 4) {
        e.salarios += valores[3];
        e.totaisFunc++;
      } else if (valores.length === 2) {
        e.proLabore += valores[0] + valores[1];
        e.totaisSocios++;
      } else {
        e.avisos.push("Linha de TOTAL DE ADICIONAIS com formato inesperado — confira.");
      }
    }

    const fgts = p.match(
      new RegExp(String.raw`FGTS Mensal:\s*\r?\nMulta FGTS:\s*\r?\nFGTS 13º:\s*\r?\n(${NUM})\s*\r?\n(${NUM})\s*\r?\n(${NUM})`),
    );
    if (fgts) {
      e.fgts += parseNumeroBr(fgts[1]) + parseNumeroBr(fgts[3]);
      e.fgtsLido = true;
    }
    const fgtsResc = p.match(new RegExp(String.raw`FGTS Rescis[óo]rio:\s*(${NUM})`));
    if (fgtsResc) e.fgts += parseNumeroBr(fgtsResc[1]);
  }

  if (porDocumento.size === 0) return null;

  return [...porDocumento.values()].map(
    ({ totaisFunc, totaisSocios, secaoFunc, secaoSocios, fgtsLido, ...e }) => {
      const avisos = [...e.avisos];
      if (secaoFunc && totaisFunc !== 1) avisos.push("Não achei o total de adicionais dos funcionários.");
      if (secaoSocios && totaisSocios !== 1) avisos.push("Não achei o total de adicionais dos sócios.");
      if (!fgtsLido && secaoFunc) avisos.push("Não achei o FGTS Mensal.");
      if (!secaoFunc && !secaoSocios) avisos.push("Nenhuma seção de valores (funcionários ou sócios).");
      return {
        ...e,
        proLabore: arredondar(e.proLabore),
        salarios: arredondar(e.salarios),
        fgts: arredondar(e.fgts),
        avisos,
      };
    },
  );
}

function arredondar(v: number) {
  return Math.round(v * 100) / 100;
}

// CSV no mesmo formato que a prévia exporta (abre direto no Excel pt-BR):
// cnpj;empresa;competencia;pro_labore_autonomos;salarios;fgts
// competencia em MM/AAAA ou AAAA-MM; valores com vírgula ou ponto decimal.
export function parseResumoFolhaCsv(texto: string): { linhas: ResumoFolhaEmpresa[]; erros: string[] } {
  const linhasTexto = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  const erros: string[] = [];
  if (linhasTexto.length === 0) return { linhas: [], erros: ["Arquivo vazio."] };

  const sep = linhasTexto[0].includes(";") ? ";" : ",";
  const cab = linhasTexto[0].split(sep).map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ""));
  const idx = (...nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
  const iDoc = idx("cnpj", "documento");
  const iNome = idx("empresa", "nome");
  const iComp = idx("competencia", "competência");
  const iPl = idx("pro_labore_autonomos", "pro_labore", "pró-labore");
  const iSal = idx("salarios", "salários");
  const iFgts = idx("fgts");
  if ([iDoc, iComp, iPl, iSal, iFgts].some((i) => i < 0)) {
    return {
      linhas: [],
      erros: ["Cabeçalho esperado: cnpj;empresa;competencia;pro_labore_autonomos;salarios;fgts"],
    };
  }

  const numero = (s: string | undefined): number | null => {
    const v = (s ?? "").trim().replace(/^"|"$/g, "").replace(/^R\$\s*/, "");
    if (v === "") return 0;
    const n = v.includes(",") ? parseNumeroBr(v) : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const linhas: ResumoFolhaEmpresa[] = [];
  linhasTexto.slice(1).forEach((linha, i) => {
    const c = linha.split(sep);
    const n = i + 2;
    const documento = (c[iDoc] ?? "").replace(/\D/g, "");
    const compBruta = (c[iComp] ?? "").trim().replace(/^"|"$/g, "");
    const comp = /^(\d{2})\/(\d{4})$/.exec(compBruta);
    const competencia = comp ? `${comp[2]}-${comp[1]}` : /^\d{4}-\d{2}$/.test(compBruta) ? compBruta : null;
    const proLabore = numero(c[iPl]);
    const salarios = numero(c[iSal]);
    const fgts = numero(c[iFgts]);
    if (documento.length !== 14 && documento.length !== 11) return erros.push(`Linha ${n}: CNPJ inválido.`);
    if (!competencia) return erros.push(`Linha ${n}: competência inválida (use MM/AAAA).`);
    if (proLabore == null || salarios == null || fgts == null) return erros.push(`Linha ${n}: valor inválido.`);
    linhas.push({
      documento,
      nome: iNome >= 0 ? (c[iNome] ?? "").trim().replace(/^"|"$/g, "") : "",
      codigoFolha: null,
      competencia,
      proLabore: arredondar(proLabore),
      salarios: arredondar(salarios),
      fgts: arredondar(fgts),
      avisos: [],
    });
  });
  return { linhas, erros };
}
