"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PDFParse } from "pdf-parse";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { proximaCompetencia } from "@/lib/competencia";
import {
  parseResumoFolha,
  parseResumoFolhaCsv,
  type ResumoFolhaEmpresa,
} from "@/lib/pdf-import/resumo-folha";

// Importação da folha de TODAS as empresas a partir do "Resumo da folha"
// (PDF do sistema de folha com uma seção por empresa) ou do CSV que a
// prévia exporta. Mesma regra de competência da importação por empresa
// (salvarFolhaAnaliticaImportada): pró-labore (+ autônomos) entra no mês
// da própria folha; salários e FGTS vão pro mês seguinte, quando são
// efetivamente pagos/recolhidos.

type FolhaRow = {
  company_id: string;
  competencia: string;
  valor: number | string;
  pro_labore: number | string | null;
  fgts: number | string | null;
};

type CompanyRow = {
  id: string;
  legal_name: string;
  codigo_cliente: string | null;
  cnpj: string | null;
  ativa: boolean;
  tax_regime: string | null;
  sujeito_fator_r: boolean | null;
};

export type PreviaFolhaLinha = {
  chave: string; // `${companyId}|${competencia}`
  companyId: string;
  empresa: string;
  codigoCliente: string | null;
  cnpj: string;
  usaFatorR: boolean;
  ativa: boolean;
  competencia: string; // mês da folha (pró-labore)
  competenciaSalariosFgts: string; // mês seguinte
  proLabore: number;
  salarios: number;
  fgts: number;
  // O que já está gravado nos campos que essa linha vai preencher.
  atual: { proLabore: number | null; salarios: number | null; fgts: number | null };
  situacao: "NOVO" | "SOBRESCREVE" | "SEM_MUDANCA";
  avisos: string[];
};

export type FolhaNaoEncontrada = {
  documento: string; // CNPJ formatado, ou CPF/CEI mascarado
  nome: string;
  competencia: string;
  proLabore: number;
  salarios: number;
  fgts: number;
};

export type LerResumoFolhaState =
  | {
      error?: string;
      previa?: {
        arquivo: string;
        linhas: PreviaFolhaLinha[];
        naoEncontradas: FolhaNaoEncontrada[];
        errosCsv: string[];
      };
    }
  | undefined;

async function extrairTextoPdf(arquivo: File): Promise<string> {
  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  const resultado = await parser.getText();
  return resultado.text;
}

function mascararDocumento(doc: string): string {
  if (doc.length === 14) return doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  // CPF/CEI de empregador pessoa física — dado pessoal, só os 2 últimos dígitos.
  return `${"•".repeat(doc.length - 2)}${doc.slice(-2)}`;
}

const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
const iguais = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.005;
// Um valor já gravado só conta como "sobrescrito" se for diferente de zero —
// a importação de pró-labore cria a linha do mês com valor 0 de marcador.
const sobrescreve = (atual: number | null, novo: number) => atual != null && atual !== 0 && !iguais(atual, novo);

async function buscarFolhaDasCompetencias(
  supabase: Awaited<ReturnType<typeof createClient>>,
  competencias: string[],
): Promise<Map<string, FolhaRow>> {
  const rows = await buscarTudoPaginado<FolhaRow>((from, to) =>
    supabase
      .from("folha_mensal")
      .select("company_id, competencia, valor, pro_labore, fgts")
      .in("competencia", competencias)
      .order("company_id")
      .order("competencia")
      .range(from, to),
  );
  return new Map(rows.map((r) => [`${r.company_id}|${r.competencia}`, r]));
}

export async function lerResumoFolhaLote(
  _prev: LerResumoFolhaState,
  formData: FormData,
): Promise<LerResumoFolhaState> {
  await requireSomaStaff();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione o PDF do Resumo da folha (ou o CSV)." };
  }

  const ehCsv = /\.csv$/i.test(arquivo.name) || arquivo.type === "text/csv";
  let empresasArquivo: ResumoFolhaEmpresa[];
  let errosCsv: string[] = [];
  if (ehCsv) {
    const r = parseResumoFolhaCsv(await arquivo.text());
    empresasArquivo = r.linhas;
    errosCsv = r.erros;
    if (empresasArquivo.length === 0) return { error: errosCsv[0] ?? "Nenhuma linha válida no CSV." };
  } else {
    let texto: string;
    try {
      texto = await extrairTextoPdf(arquivo);
    } catch {
      return { error: "Não foi possível ler esse PDF." };
    }
    const r = parseResumoFolha(texto);
    if (!r || r.length === 0) {
      return { error: "Não reconheci esse arquivo como o Resumo da folha (Resumo Geral)." };
    }
    empresasArquivo = r;
  }

  const supabase = await createClient();
  const companies = await buscarTudoPaginado<CompanyRow>((from, to) =>
    supabase
      .from("companies")
      .select("id, legal_name, codigo_cliente, cnpj, ativa, tax_regime, sujeito_fator_r")
      .not("cnpj", "is", null)
      .order("id")
      .range(from, to),
  );
  const porCnpj = new Map(companies.map((c) => [c.cnpj!, c]));

  const competencias = new Set<string>();
  for (const e of empresasArquivo) {
    competencias.add(e.competencia);
    competencias.add(proximaCompetencia(e.competencia));
  }
  const existentes = await buscarFolhaDasCompetencias(supabase, [...competencias]);

  const linhas: PreviaFolhaLinha[] = [];
  const naoEncontradas: FolhaNaoEncontrada[] = [];
  const vistas = new Set<string>();

  for (const e of empresasArquivo) {
    const company = e.documento.length === 14 ? porCnpj.get(e.documento) : undefined;
    if (!company) {
      naoEncontradas.push({
        documento: mascararDocumento(e.documento),
        nome: e.nome,
        competencia: e.competencia,
        proLabore: e.proLabore,
        salarios: e.salarios,
        fgts: e.fgts,
      });
      continue;
    }
    const chave = `${company.id}|${e.competencia}`;
    const avisos = [...e.avisos];
    if (vistas.has(chave)) {
      avisos.push("Empresa repetida no arquivo para essa competência — vale a última linha.");
      const i = linhas.findIndex((l) => l.chave === chave);
      if (i >= 0) linhas.splice(i, 1);
    }
    vistas.add(chave);

    const competenciaSalariosFgts = proximaCompetencia(e.competencia);
    const linhaM = existentes.get(`${company.id}|${e.competencia}`);
    const linhaM1 = existentes.get(`${company.id}|${competenciaSalariosFgts}`);
    const atual = {
      proLabore: num(linhaM?.pro_labore),
      salarios: num(linhaM1?.valor),
      fgts: num(linhaM1?.fgts),
    };
    const usaFatorR = company.tax_regime === "SIMPLES_NACIONAL" && !!company.sujeito_fator_r;
    if (!company.ativa) avisos.push("Empresa inativa no cadastro.");

    const semMudanca =
      iguais(atual.proLabore, e.proLabore) && iguais(atual.salarios, e.salarios) && iguais(atual.fgts, e.fgts);
    const situacao = semMudanca
      ? "SEM_MUDANCA"
      : sobrescreve(atual.proLabore, e.proLabore) ||
          sobrescreve(atual.salarios, e.salarios) ||
          sobrescreve(atual.fgts, e.fgts)
        ? "SOBRESCREVE"
        : "NOVO";

    linhas.push({
      chave,
      companyId: company.id,
      empresa: company.legal_name,
      codigoCliente: company.codigo_cliente,
      cnpj: mascararDocumento(e.documento),
      usaFatorR,
      ativa: company.ativa,
      competencia: e.competencia,
      competenciaSalariosFgts,
      proLabore: e.proLabore,
      salarios: e.salarios,
      fgts: e.fgts,
      atual,
      situacao,
      avisos,
    });
  }

  linhas.sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR") || a.competencia.localeCompare(b.competencia));
  naoEncontradas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { previa: { arquivo: arquivo.name, linhas, naoEncontradas, errosCsv } };
}

const itemSchema = z.object({
  companyId: uuidLike,
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  proLabore: z.number().min(0),
  salarios: z.number().min(0),
  fgts: z.number().min(0),
});

const salvarSchema = z.string().transform((v, ctx) => {
  try {
    return z.array(itemSchema).min(1).max(5000).parse(JSON.parse(v));
  } catch {
    ctx.addIssue({ code: "custom", message: "Dados inválidos." });
    return z.NEVER;
  }
});

export type SalvarFolhaLoteGlobalState =
  | { error?: string; success?: boolean; empresas?: number; linhasGravadas?: number }
  | undefined;

export async function salvarResumoFolhaLote(
  _prev: SalvarFolhaLoteGlobalState,
  formData: FormData,
): Promise<SalvarFolhaLoteGlobalState> {
  await requireSomaStaff();

  const parsed = salvarSchema.safeParse(formData.get("itens"));
  if (!parsed.success) return { error: "Nada selecionado pra gravar." };
  const itens = parsed.data;

  // Junta tudo por (empresa, competência) antes de gravar: o pró-labore
  // de um mês e os salários/FGTS do mês anterior caem na MESMA linha de
  // folha_mensal — acontece num CSV com vários meses da mesma empresa.
  type Parcial = { pro_labore?: number; valor?: number; fgts?: number };
  const destino = new Map<string, Parcial>();
  const pegar = (k: string) => destino.get(k) ?? (destino.set(k, {}), destino.get(k)!);
  for (const it of itens) {
    pegar(`${it.companyId}|${it.competencia}`).pro_labore = it.proLabore;
    const m1 = pegar(`${it.companyId}|${proximaCompetencia(it.competencia)}`);
    m1.valor = it.salarios;
    m1.fgts = it.fgts;
  }

  const supabase = await createClient();
  const competencias = [...new Set([...destino.keys()].map((k) => k.split("|")[1]))];
  let existentes: Map<string, FolhaRow>;
  try {
    existentes = await buscarFolhaDasCompetencias(supabase, competencias);
  } catch {
    return { error: "Não foi possível ler a folha já gravada." };
  }

  // Upsert grava todas as colunas — o campo que essa importação não traz
  // pra aquela competência mantém o que já estava salvo.
  const rows = [...destino].map(([k, p]) => {
    const [company_id, competencia] = k.split("|");
    const ex = existentes.get(k);
    return {
      company_id,
      competencia,
      valor: p.valor ?? num(ex?.valor) ?? 0,
      fgts: p.fgts !== undefined ? p.fgts : num(ex?.fgts),
      pro_labore: p.pro_labore !== undefined ? p.pro_labore : num(ex?.pro_labore),
    };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("folha_mensal")
      .upsert(rows.slice(i, i + 500), { onConflict: "company_id,competencia" });
    if (error) {
      return {
        error: `Não foi possível gravar a folha (parou em ${i} de ${rows.length} linhas; as anteriores foram gravadas).`,
      };
    }
  }

  revalidatePath("/admin", "layout");
  return {
    success: true,
    empresas: new Set(itens.map((i) => i.companyId)).size,
    linhasGravadas: rows.length,
  };
}
