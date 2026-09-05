import "server-only";
import { tool, type Tool } from "ai";
import { get } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { tipoAplicavel } from "@/app/legalizacao/status";

// Cada ferramenta aqui é uma consulta bem definida, nunca SQL livre escrito
// pela IA — a "inteligência" vem de Claude decidir quais chamar e como
// interpretar o resultado, não de gerar a query. Todas usam createClient()
// (RLS do usuário logado, nunca service role), então mesmo uma chamada com
// parâmetro estranho nunca vaza mais do que aquele staff já poderia ver.

function diasAteVencer(data: string): number {
  return Math.ceil((new Date(data).getTime() - Date.now()) / 86_400_000);
}

// Nota ACCEPTED ainda pode ter sido cancelada depois (evento CANCELAMENTO em
// nfse_events, mesmo padrão de lib/actions/notas.ts:456) — toda consulta de
// faturamento precisa excluir isso, senão conta receita de nota cancelada.
type NotaComEventos = { nfse: { nfse_events: { type: string }[] | null } | null };
function notaValida(nota: NotaComEventos): boolean {
  return !(nota.nfse?.nfse_events ?? []).some((e) => e.type === "CANCELAMENTO");
}

export const buscarEmpresa = tool({
  description:
    "Encontra uma ou mais empresas pelo nome (razão social ou nome fantasia) ou CNPJ. Use sempre que a pergunta citar uma empresa pelo nome — as outras ferramentas precisam do companyId (UUID), não do nome.",
  inputSchema: z.object({
    termo: z.string().describe("Nome (parcial ou completo) ou CNPJ da empresa."),
  }),
  execute: async ({ termo }) => {
    const supabase = await createClient();
    const digits = termo.replace(/\D/g, "");
    const query = supabase
      .from("companies")
      .select("id, legal_name, trade_name, cnpj, tax_regime, municipality_name, state")
      .limit(10);
    const { data } =
      digits.length >= 8
        ? await query.ilike("cnpj", `%${digits}%`)
        : await query.or(`legal_name.ilike.%${termo}%,trade_name.ilike.%${termo}%`);
    return { empresas: data ?? [] };
  },
});

export const consultarFaturamentoPorServico = tool({
  description:
    "Faturamento de uma empresa num período, separado por código de atividade/tributação nacional do serviço (o 'código de atividade da nota'). Soma o valor das notas emitidas (dps) por serviço, excluindo notas rejeitadas ou canceladas.",
  inputSchema: z.object({
    companyId: z.string().describe("UUID da empresa (use buscarEmpresa primeiro se só tiver o nome)."),
    competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).describe("Mês inicial, formato YYYY-MM."),
    competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).describe("Mês final (inclusive), formato YYYY-MM."),
  }),
  execute: async ({ companyId, competenciaInicio, competenciaFim }) => {
    const supabase = await createClient();
    const inicio = `${competenciaInicio}-01`;
    const fim = new Date(`${competenciaFim}-01T00:00:00Z`);
    fim.setUTCMonth(fim.getUTCMonth() + 1);

    const { data: notas } = await supabase
      .from("dps")
      .select("id, valor, data_competencia, service_id, services(name, national_tax_code), nfse(id, nfse_events(type))")
      .eq("company_id", companyId)
      .eq("status", "ACCEPTED")
      .gte("data_competencia", inicio)
      .lt("data_competencia", fim.toISOString().slice(0, 10));

    type Linha = NotaComEventos & {
      valor: number;
      services: { name: string; national_tax_code: string | null } | null;
    };
    const validas = ((notas ?? []) as unknown as Linha[]).filter(notaValida);

    const porServico = new Map<string, { codigo: string | null; nome: string; total: number; quantidade: number }>();
    for (const nota of validas) {
      const codigo = nota.services?.national_tax_code ?? null;
      const nome = nota.services?.name ?? "Serviço removido";
      const chave = codigo ?? nome;
      if (!porServico.has(chave)) porServico.set(chave, { codigo, nome, total: 0, quantidade: 0 });
      const item = porServico.get(chave)!;
      item.total += Number(nota.valor);
      item.quantidade += 1;
    }

    return {
      periodo: { competenciaInicio, competenciaFim },
      totalGeral: validas.reduce((soma, n) => soma + Number(n.valor), 0),
      totalNotas: validas.length,
      porCodigoAtividade: [...porServico.values()].sort((a, b) => b.total - a.total),
    };
  },
});

export const consultarFaturamentoMensal = tool({
  description:
    "Faturamento total de uma empresa mês a mês, somando notas emitidas (dps) e faturamento informado manualmente (receita_mensal_manual, usado pra competências anteriores à empresa existir no sistema).",
  inputSchema: z.object({
    companyId: z.string(),
    competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/),
    competenciaFim: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  execute: async ({ companyId, competenciaInicio, competenciaFim }) => {
    const supabase = await createClient();
    const inicio = `${competenciaInicio}-01`;
    const fim = new Date(`${competenciaFim}-01T00:00:00Z`);
    fim.setUTCMonth(fim.getUTCMonth() + 1);

    const [{ data: notas }, { data: manual }] = await Promise.all([
      supabase
        .from("dps")
        .select("valor, data_competencia, nfse(nfse_events(type))")
        .eq("company_id", companyId)
        .eq("status", "ACCEPTED")
        .gte("data_competencia", inicio)
        .lt("data_competencia", fim.toISOString().slice(0, 10)),
      supabase
        .from("receita_mensal_manual")
        .select("competencia, valor")
        .eq("company_id", companyId)
        .gte("competencia", competenciaInicio)
        .lte("competencia", competenciaFim),
    ]);

    type LinhaMensal = NotaComEventos & { valor: number; data_competencia: string };
    const porMes = new Map<string, number>();
    for (const nota of ((notas ?? []) as unknown as LinhaMensal[]).filter(notaValida)) {
      const mes = nota.data_competencia.slice(0, 7);
      porMes.set(mes, (porMes.get(mes) ?? 0) + Number(nota.valor));
    }
    for (const linha of manual ?? []) {
      porMes.set(linha.competencia, (porMes.get(linha.competencia) ?? 0) + Number(linha.valor));
    }

    return {
      porMes: [...porMes.entries()].map(([competencia, total]) => ({ competencia, total })).sort((a, b) =>
        a.competencia.localeCompare(b.competencia),
      ),
    };
  },
});

export const consultarNotasComErro = tool({
  description: "Lista erros de emissão de NFS-e, opcionalmente filtrado por empresa e período.",
  inputSchema: z.object({
    companyId: z.string().optional(),
    competenciaInicio: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    competenciaFim: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }),
  execute: async ({ companyId, competenciaInicio, competenciaFim }) => {
    const supabase = await createClient();
    let query = supabase
      .from("nfse_errors")
      .select("id, user_message, created_at, companies(legal_name, trade_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (companyId) query = query.eq("company_id", companyId);
    if (competenciaInicio) query = query.gte("created_at", `${competenciaInicio}-01`);
    if (competenciaFim) {
      const fim = new Date(`${competenciaFim}-01T00:00:00Z`);
      fim.setUTCMonth(fim.getUTCMonth() + 1);
      query = query.lt("created_at", fim.toISOString());
    }
    const { data } = await query;
    return { erros: data ?? [] };
  },
});

export const consultarFolhaMensal = tool({
  description: "Valor da folha de pagamento mensal informada de uma empresa numa competência (usada no Fator R).",
  inputSchema: z.object({
    companyId: z.string(),
    competencia: z.string().regex(/^\d{4}-\d{2}$/),
  }),
  execute: async ({ companyId, competencia }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("folha_mensal")
      .select("valor")
      .eq("company_id", companyId)
      .eq("competencia", competencia)
      .maybeSingle();
    return { competencia, valor: data?.valor ?? null };
  },
});

export const consultarCertificados = tool({
  description: "Situação dos certificados digitais A1 das empresas — vencidos, vencendo, ou todos.",
  inputSchema: z.object({
    status: z.enum(["vencendo_45d", "vencido", "todos"]).default("todos"),
  }),
  execute: async ({ status }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("companies")
      .select("id, legal_name, trade_name, certificates(expires_at)")
      .order("legal_name");

    type Empresa = {
      id: string;
      legal_name: string;
      trade_name: string | null;
      certificates: { expires_at: string } | null;
    };
    const empresas = ((data ?? []) as unknown as Empresa[])
      .filter((e) => e.certificates != null)
      .map((e) => ({ ...e, dias: diasAteVencer(e.certificates!.expires_at) }));

    const filtradas =
      status === "vencido"
        ? empresas.filter((e) => e.dias < 0)
        : status === "vencendo_45d"
          ? empresas.filter((e) => e.dias >= 0 && e.dias <= 45)
          : empresas;

    return {
      certificados: filtradas.map((e) => ({
        empresa: e.trade_name || e.legal_name,
        expiresAt: e.certificates!.expires_at,
        dias: e.dias,
      })),
    };
  },
});

export const consultarLegalizacaoPendencias = tool({
  description:
    "Pendências de documentação de legalização (Alvará, CNES, Certidão, Vigilância Sanitária, etc.) — tipos aplicáveis sem documento cadastrado ou com documento vencido. Opcionalmente filtrado por uma empresa.",
  inputSchema: z.object({ companyId: z.string().optional() }),
  execute: async ({ companyId }) => {
    const supabase = await createClient();
    let empresasQuery = supabase
      .from("companies")
      .select("id, legal_name, trade_name, legalizacao_documentos(tipo_id, data_vencimento)")
      .order("legal_name");
    if (companyId) empresasQuery = empresasQuery.eq("id", companyId);

    const [{ data: empresas }, { data: tipos }, { data: excecoes }] = await Promise.all([
      empresasQuery,
      supabase.from("legalizacao_tipos_documento").select("id, nome, aplica_a_todas").eq("ativo", true),
      supabase.from("legalizacao_tipos_empresas_excecao").select("company_id, tipo_id, aplicavel"),
    ]);

    const excecaoPorChave = new Map((excecoes ?? []).map((r) => [`${r.company_id}:${r.tipo_id}`, r.aplicavel]));

    type Empresa = {
      id: string;
      legal_name: string;
      trade_name: string | null;
      legalizacao_documentos: { tipo_id: string; data_vencimento: string | null }[] | null;
    };
    const resultado = ((empresas ?? []) as unknown as Empresa[]).map((e) => {
      const aplicaveis = (tipos ?? []).filter((t) => tipoAplicavel(t.aplica_a_todas, excecaoPorChave.get(`${e.id}:${t.id}`)));
      const documentoPorTipo = new Map((e.legalizacao_documentos ?? []).map((d) => [d.tipo_id, d]));
      const pendencias: string[] = [];
      for (const tipo of aplicaveis) {
        const doc = documentoPorTipo.get(tipo.id);
        if (!doc) pendencias.push(`${tipo.nome} (sem documento)`);
        else if (doc.data_vencimento && diasAteVencer(doc.data_vencimento) < 0) pendencias.push(`${tipo.nome} (vencido)`);
      }
      return { empresa: e.trade_name || e.legal_name, pendencias };
    });

    return { empresas: resultado.filter((e) => e.pendencias.length > 0) };
  },
});

export const consultarExtratosPendentes = tool({
  description: "Contas bancárias que ainda não entregaram o extrato de uma competência.",
  inputSchema: z.object({ competencia: z.string().regex(/^\d{4}-\d{2}$/) }),
  execute: async ({ competencia }) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("extrato_contas_bancarias")
      .select("id, banco, agencia, conta, companies(legal_name, trade_name), extratos_mensais(competencia, entregue)")
      .eq("ativo", true);

    type Conta = {
      banco: string;
      agencia: string;
      conta: string;
      companies: { legal_name: string; trade_name: string | null } | null;
      extratos_mensais: { competencia: string; entregue: boolean }[] | null;
    };
    const pendentes = ((data ?? []) as unknown as Conta[]).filter((c) => {
      const doMes = (c.extratos_mensais ?? []).find((m) => m.competencia === competencia);
      return !doMes || !doMes.entregue;
    });

    return {
      competencia,
      pendentes: pendentes.map((c) => ({
        empresa: c.companies?.trade_name || c.companies?.legal_name,
        banco: c.banco,
        conta: `${c.agencia}/${c.conta}`,
      })),
    };
  },
});

export const consultarSocietario = tool({
  description: "Sócios de uma empresa (PF ou PJ) com percentual de participação, e quantos documentos societários/de sócio estão cadastrados.",
  inputSchema: z.object({ companyId: z.string() }),
  execute: async ({ companyId }) => {
    const supabase = await createClient();
    const [{ data: socios }, { data: documentos }] = await Promise.all([
      supabase
        .from("socios")
        .select("id, tipo_pessoa, nome, documento, percentual_participacao, data_entrada, data_saida")
        .eq("company_id", companyId),
      supabase.from("societario_documentos").select("descricao, data_documento").eq("company_id", companyId),
    ]);
    return { socios: socios ?? [], historicoSocietario: documentos ?? [] };
  },
});

export const listarEmpresas = tool({
  description: "Lista empresas filtrando por regime tributário e/ou cidade.",
  inputSchema: z.object({
    regimeTributario: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "IMUNE_ISENTO"]).optional(),
    cidade: z.string().optional(),
  }),
  execute: async ({ regimeTributario, cidade }) => {
    const supabase = await createClient();
    let query = supabase.from("companies").select("id, legal_name, trade_name, tax_regime, municipality_name, state");
    if (regimeTributario) query = query.eq("tax_regime", regimeTributario);
    if (cidade) query = query.ilike("municipality_name", `%${cidade}%`);
    const { data } = await query.order("legal_name").limit(100);
    return { empresas: data ?? [] };
  },
});

// --- Leitura de documentos já anexados no sistema ---------------------------

export const listarDocumentosDaEmpresa = tool({
  description:
    "Lista todos os documentos já cadastrados de uma empresa (legalização, societário, sócios, extratos bancários) — use antes de lerConteudoDocumento pra descobrir o documentoId e o módulo certos.",
  inputSchema: z.object({ companyId: z.string() }),
  execute: async ({ companyId }) => {
    const supabase = await createClient();
    const [{ data: legalizacao }, { data: societario }, { data: socios }, { data: extratos }] = await Promise.all([
      supabase
        .from("legalizacao_documentos")
        .select("id, nome_arquivo, data_vencimento, legalizacao_tipos_documento(nome)")
        .eq("company_id", companyId),
      supabase.from("societario_documentos").select("id, descricao, data_documento, nome_arquivo").eq("company_id", companyId),
      supabase
        .from("socios")
        .select("id, nome, socios_documentos(id, descricao, nome_arquivo)")
        .eq("company_id", companyId),
      supabase
        .from("extrato_contas_bancarias")
        .select("id, banco, extratos_mensais(id, competencia, nome_arquivo)")
        .eq("company_id", companyId),
    ]);

    type LegalizacaoDoc = { id: string; nome_arquivo: string; data_vencimento: string | null; legalizacao_tipos_documento: { nome: string } | null };
    type Socio = { id: string; nome: string; socios_documentos: { id: string; descricao: string; nome_arquivo: string }[] | null };
    type Conta = { id: string; banco: string; extratos_mensais: { id: string; competencia: string; nome_arquivo: string | null }[] | null };

    const documentos = [
      ...((legalizacao ?? []) as unknown as LegalizacaoDoc[]).map((d) => ({
        modulo: "legalizacao" as const,
        documentoId: d.id,
        descricao: d.legalizacao_tipos_documento?.nome ?? "Documento de legalização",
        arquivo: d.nome_arquivo,
      })),
      ...(societario ?? []).map((d) => ({
        modulo: "societario" as const,
        documentoId: d.id,
        descricao: d.descricao,
        arquivo: d.nome_arquivo,
      })),
      ...((socios ?? []) as unknown as Socio[]).flatMap((s) =>
        (s.socios_documentos ?? []).map((doc) => ({
          modulo: "socio" as const,
          documentoId: doc.id,
          descricao: `${doc.descricao} (sócio: ${s.nome})`,
          arquivo: doc.nome_arquivo,
        })),
      ),
      ...((extratos ?? []) as unknown as Conta[]).flatMap((c) =>
        (c.extratos_mensais ?? [])
          .filter((m) => m.nome_arquivo)
          .map((m) => ({
            modulo: "extrato" as const,
            documentoId: m.id,
            descricao: `Extrato ${c.banco} — ${m.competencia}`,
            arquivo: m.nome_arquivo!,
          })),
      ),
    ];

    return { documentos };
  },
});

const TABELA_POR_MODULO = {
  legalizacao: "legalizacao_documentos",
  societario: "societario_documentos",
  socio: "socios_documentos",
  extrato: "extratos_mensais",
} as const;

type LerConteudoDocumentoInput = {
  modulo: "legalizacao" | "societario" | "socio" | "extrato";
  documentoId: string;
};
type LerConteudoDocumentoOutput =
  | { erro: string }
  | { nomeArquivo: string; mediaType: string; base64: string };

const lerConteudoDocumentoConfig: Tool<LerConteudoDocumentoInput, LerConteudoDocumentoOutput> = {
  description:
    "Busca o conteúdo real de um documento já anexado no sistema (PDF) pra ler, analisar, resumir ou sugerir uma redação revisada. Use listarDocumentosDaEmpresa antes pra achar o documentoId e o módulo certos.",
  inputSchema: z.object({
    modulo: z.enum(["legalizacao", "societario", "socio", "extrato"]),
    documentoId: z.string(),
  }),
  execute: async ({ modulo, documentoId }) => {
    const supabase = await createClient();
    const tabela = TABELA_POR_MODULO[modulo];
    const { data: documento } = await supabase
      .from(tabela)
      .select("blob_pathname, nome_arquivo")
      .eq("id", documentoId)
      .maybeSingle();
    if (!documento?.blob_pathname) return { erro: "Documento não encontrado ou sem arquivo anexado." };

    const blob = await get(documento.blob_pathname, { access: "private" });
    if (!blob || blob.statusCode !== 200) return { erro: "Arquivo não encontrado no armazenamento." };

    const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
    if (buffer.byteLength > 30 * 1024 * 1024) return { erro: "Arquivo grande demais pra análise (limite ~30MB)." };

    return {
      nomeArquivo: documento.nome_arquivo,
      mediaType: blob.blob.contentType || "application/pdf",
      base64: buffer.toString("base64"),
    };
  },
  toModelOutput: ({ output }) => {
    if ("erro" in output) return { type: "error-text", value: output.erro };
    return {
      type: "content",
      value: [
        { type: "text", text: `Documento: ${output.nomeArquivo}` },
        { type: "file", data: { type: "data", data: output.base64 }, mediaType: output.mediaType, filename: output.nomeArquivo },
      ],
    };
  },
};
export const lerConteudoDocumento = tool(lerConteudoDocumentoConfig);

export const chatTools = {
  buscarEmpresa,
  consultarFaturamentoPorServico,
  consultarFaturamentoMensal,
  consultarNotasComErro,
  consultarFolhaMensal,
  consultarCertificados,
  consultarLegalizacaoPendencias,
  consultarExtratosPendentes,
  consultarSocietario,
  listarEmpresas,
  listarDocumentosDaEmpresa,
  lerConteudoDocumento,
};
