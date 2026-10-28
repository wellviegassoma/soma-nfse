import "server-only";
import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";

// Consulta de guias do FGTS Digital via Infosimples (consulta "FGTS / Guia
// de Arrecadação"). Autentica sempre com o certificado da SOMA, como
// procuradora — o cliente consultado vai em `representado`. Só funciona
// pra cliente que tenha procuração eletrônica pra SOMA cadastrada no
// FGTS Digital; sem ela o próprio portal recusa e isso volta como erro.
//
// Custo: preço base da faixa (R$ 0,20 nas primeiras 500 do mês) + R$ 0,08
// de adicional por chamada. Franquia mínima da conta: R$ 100/mês.
const URL_CONSULTA = "https://api.infosimples.com/api/v2/consultas/fgts/guia";

// Quanto a Infosimples espera o FGTS Digital responder. 120s não bastou na
// primeira consulta real (voltou 605 — timeout, que a Infosimples não
// cobra); fica logo abaixo do maxDuration=300 da rota, com folga pro
// fetch abortar antes de a plataforma matar a função.
const TIMEOUT_INFOSIMPLES_S = 270;

// CNPJ da SOMA Contabilidade Integrada — dona do certificado usado como
// procuradora. Sobrescrevível por env caso o certificado mude de empresa.
const CNPJ_PROCURADOR_PADRAO = "43852255000195";

// A resposta vem paginada (no máximo 10 guias por página) e cada página
// é uma chamada paga — um mês normal tem 1 ou 2 guias, então o teto só
// existe pra nenhuma resposta estranha virar um laço de cobrança.
const MAX_PAGINAS = 3;

// A Infosimples exige pkcs12_cert e pkcs12_pass criptografados com a
// chave da conta (área do cliente → docs/certificados#criptografia), no
// formato da biblioteca AesBridge (modo GCM): PBKDF2-HMAC-SHA256 com 100
// mil iterações sobre a chave, sal de 16 bytes, AES-256-GCM com nonce de
// 12 bytes, saída sal||nonce||cifrado||tag em Base64 url-safe sem "=".
// Feito com o crypto nativo em vez do pacote aes-bridge, que puxa como
// dependência o pacote "crypto" obsoleto do npm.
function criptogramaInfosimples(texto: string, chave: string): string {
  const sal = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const chaveDerivada = crypto.pbkdf2Sync(Buffer.from(chave, "utf8"), sal, 100_000, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", chaveDerivada, nonce);
  const cifrado = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  return Buffer.concat([sal, nonce, cifrado, cipher.getAuthTag()])
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// Competência das guias consultadas: o mês anterior ao corrente (horário de
// Brasília) — é a guia que vence no dia 20 do mês corrente, e também o
// padrão da própria Infosimples quando `periodo` não é informado.
export function periodoFgtsPadrao(agora = new Date()): string {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(agora)
    .split("-")
    .map(Number);
  const anterior = mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 };
  return `${anterior.ano}${String(anterior.mes).padStart(2, "0")}`;
}

export type GuiaFgts = {
  numero: string | null;
  tipo: string | null;
  situacao: string | null;
  data_emissao: string | null;
  data_limite_pagamento: string | null;
  data_arrecadacao: string | null;
  valor_total: number | null;
  guia_pdf_url: string | null;
};

export type ResultadoConsultaFgts =
  | { status: "sucesso"; guias: GuiaFgts[]; qtdEmAberto: number; valorEmAberto: number; resposta: unknown }
  | { status: "erro"; erro: string; resposta: unknown };

// A documentação pública não lista os valores possíveis de `situacao`.
// Uma guia não foi paga quando não tem data_arrecadacao e a situação não
// indica pagamento/cancelamento. No primeiro lote real (10/2026) as
// situações vistas foram "Paga Individualizada" e "Expirada".
function guiaNaoPaga(guia: GuiaFgts): boolean {
  if (guia.data_arrecadacao) return false;
  return !/pag|quit|liquid|arrecad|cancel/i.test(guia.situacao ?? "");
}

function dataBr(texto: string | null): number {
  const m = texto?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : 0;
}

// Guias em aberto de UMA consulta (um período). Visto no primeiro lote
// real: quem perde o prazo emite a guia de novo (vencimento seguinte, com
// encargos) e a antiga fica "Expirada" — a mesma dívida aparecia 2x e era
// somada 2x. Então, por tipo (MENSAL, RESCISORIA...): se alguma guia foi
// paga, nada daquele tipo fica em aberto; senão, só a mais recente conta.
export function guiasEmAberto(guias: GuiaFgts[]): GuiaFgts[] {
  const porTipo = new Map<string, GuiaFgts[]>();
  for (const g of guias) {
    const tipo = g.tipo ?? "";
    porTipo.set(tipo, [...(porTipo.get(tipo) ?? []), g]);
  }
  const abertas: GuiaFgts[] = [];
  for (const doTipo of porTipo.values()) {
    if (doTipo.some((g) => !guiaNaoPaga(g))) continue;
    const maisRecente = [...doTipo].sort(
      (a, b) =>
        dataBr(b.data_limite_pagamento) - dataBr(a.data_limite_pagamento) ||
        dataBr(b.data_emissao) - dataBr(a.data_emissao),
    )[0];
    if (maisRecente) abertas.push(maisRecente);
  }
  return abertas;
}

// Valores da Infosimples costumam vir como string "1.234,56" — normaliza
// pra número sem depender do formato exato.
function paraNumero(valor: unknown): number | null {
  if (typeof valor === "number") return valor;
  if (typeof valor !== "string" || !valor.trim()) return null;
  const limpo = valor.replace(/[^\d,.-]/g, "");
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function paraTexto(valor: unknown): string | null {
  return valor === null || valor === undefined || valor === "" ? null : String(valor);
}

async function certificadoProcurador(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
): Promise<{ pfxBase64: string; senha: string }> {
  const cnpj = process.env.FGTS_CNPJ_PROCURADOR || CNPJ_PROCURADOR_PADRAO;
  const { data: company } = await admin
    .from("companies")
    .select("certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("cnpj", cnpj)
    .limit(1)
    .maybeSingle();

  const certs = company?.certificates as
    | { encrypted_file: string; encrypted_password: string; expires_at: string }
    | { encrypted_file: string; encrypted_password: string; expires_at: string }[]
    | null
    | undefined;
  const cert = Array.isArray(certs) ? certs[0] : certs;
  if (!cert) throw new Error(`Certificado da SOMA (CNPJ ${cnpj}) não está cadastrado no sistema.`);
  if (new Date(cert.expires_at).getTime() < Date.now()) {
    throw new Error("Certificado digital da SOMA está vencido.");
  }
  return {
    pfxBase64: decryptSecret(fromBytea(cert.encrypted_file)).toString("base64"),
    senha: decryptSecret(fromBytea(cert.encrypted_password)).toString("utf8"),
  };
}

export async function consultarGuiasFgts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  cnpjRepresentado: string,
): Promise<ResultadoConsultaFgts> {
  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) return { status: "erro", erro: "INFOSIMPLES_TOKEN não configurado.", resposta: null };
  const chave = process.env.INFOSIMPLES_CHAVE_CRIPTOGRAFIA;
  if (!chave) return { status: "erro", erro: "INFOSIMPLES_CHAVE_CRIPTOGRAFIA não configurada.", resposta: null };

  let cert: { pfxBase64: string; senha: string };
  try {
    cert = await certificadoProcurador(admin);
  } catch (e) {
    return { status: "erro", erro: e instanceof Error ? e.message : String(e), resposta: null };
  }
  // A própria SOMA é consultada como titular, não como procuradora de si
  // mesma — `representado` só vai quando o CNPJ é de outra empresa.
  const cnpjProcurador = process.env.FGTS_CNPJ_PROCURADOR || CNPJ_PROCURADOR_PADRAO;
  const paramsRepresentado: Record<string, string> =
    cnpjRepresentado === cnpjProcurador ? {} : { representado: cnpjRepresentado };
  const pkcs12Cert = criptogramaInfosimples(cert.pfxBase64, chave);
  const pkcs12Pass = criptogramaInfosimples(cert.senha, chave);
  const periodo = periodoFgtsPadrao();

  type Pagina = {
    code?: number;
    code_message?: string;
    errors?: string[];
    data?: Record<string, unknown>[];
  };
  const paginas: Pagina[] = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    let body: Pagina;
    try {
      const resp = await fetch(URL_CONSULTA, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token,
          timeout: String(TIMEOUT_INFOSIMPLES_S),
          ...paramsRepresentado,
          periodo,
          pagina: String(pagina),
          pkcs12_cert: pkcs12Cert,
          pkcs12_pass: pkcs12Pass,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout((TIMEOUT_INFOSIMPLES_S + 15) * 1000),
      });
      // Em instabilidade a Infosimples já devolveu uma página HTML de erro
      // em vez do JSON de sempre — vira um erro legível, sem o "Unexpected
      // token '<'" do JSON.parse.
      const texto = await resp.text();
      try {
        body = JSON.parse(texto);
      } catch {
        return {
          status: "erro",
          erro: `Infosimples fora do ar (HTTP ${resp.status}, resposta não é JSON) — tente de novo.`,
          resposta: paginas,
        };
      }
      // O `header` ecoa os parâmetros enviados (hoje só o MD5 do
      // certificado e da senha) — não guarda nem isso no banco.
      const header = (body as { header?: Record<string, unknown> }).header;
      if (header) delete header.parameters;
    } catch (e) {
      return {
        status: "erro",
        erro: `Falha ao chamar a Infosimples: ${e instanceof Error ? e.message : String(e)}`,
        resposta: paginas,
      };
    }
    paginas.push(body);

    // Na Infosimples o status HTTP é sempre 200 — quem diz se deu certo é
    // `code` (200 = sucesso; 6xx = erro do lado da consulta). 612 = "nenhum
    // resultado", que aqui significa nenhuma guia no período: não é erro.
    if (body.code === 612) break;
    if (body.code !== 200) {
      const detalhe = [body.code_message, ...(body.errors ?? [])].filter(Boolean).join(" — ");
      return { status: "erro", erro: `Infosimples ${body.code ?? "?"}: ${detalhe || "erro sem mensagem"}`, resposta: paginas };
    }
    const totalPaginas = Number(body.data?.[0]?.total_paginas ?? 1);
    if (!(pagina < totalPaginas)) break;
  }

  const guias: GuiaFgts[] = paginas.flatMap((p) =>
    (p.code === 200 ? (p.data ?? []) : []).flatMap((item) =>
      ((item.guias as Record<string, unknown>[] | undefined) ?? []).map((g) => ({
        numero: paraTexto(g.numero),
        tipo: paraTexto(g.tipo),
        situacao: paraTexto(g.situacao),
        data_emissao: paraTexto(g.data_emissao),
        data_limite_pagamento: paraTexto(g.data_limite_pagamento),
        data_arrecadacao: paraTexto(g.data_arrecadacao),
        valor_total: paraNumero(g.valor_total),
        guia_pdf_url: paraTexto(g.guia_pdf_url),
      })),
    ),
  );
  const emAberto = guiasEmAberto(guias);
  return {
    status: "sucesso",
    guias,
    qtdEmAberto: emAberto.length,
    valorEmAberto: Math.round(emAberto.reduce((s, g) => s + (g.valor_total ?? 0), 0) * 100) / 100,
    resposta: paginas,
  };
}

// Consulta gratuita da Infosimples que só valida o certificado (abre o
// PFX e gera uma assinatura) — não toca no FGTS Digital. Serve pra separar
// "certificado/criptografia errados" de "portal lento ou sem procuração".
export async function testarCertificadoProcurador(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
): Promise<{ ok: boolean; mensagem: string }> {
  const token = process.env.INFOSIMPLES_TOKEN;
  const chave = process.env.INFOSIMPLES_CHAVE_CRIPTOGRAFIA;
  if (!token || !chave) return { ok: false, mensagem: "INFOSIMPLES_TOKEN ou INFOSIMPLES_CHAVE_CRIPTOGRAFIA não configurado." };
  try {
    const cert = await certificadoProcurador(admin);
    const resp = await fetch("https://api.infosimples.com/api/v2/consultas/infosimples/certificado", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        timeout: "60",
        pkcs12_cert: criptogramaInfosimples(cert.pfxBase64, chave),
        pkcs12_pass: criptogramaInfosimples(cert.senha, chave),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(75_000),
    });
    const body: { code?: number; code_message?: string; errors?: string[]; data?: { nome?: string }[] } = await resp.json();
    if (body.code === 200) return { ok: true, mensagem: `Certificado OK: ${body.data?.[0]?.nome ?? "sem nome"}` };
    const detalhe = [body.code_message, ...(body.errors ?? [])].filter(Boolean).join(" — ");
    return { ok: false, mensagem: `Infosimples ${body.code ?? "?"}: ${detalhe || "erro sem mensagem"}` };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

// Consulta e grava o resultado da empresa (substitui a consulta anterior).
export async function consultarESalvarGuiasFgts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  companyId: string,
  cnpj: string,
): Promise<ResultadoConsultaFgts> {
  const resultado = await consultarGuiasFgts(admin, cnpj);
  const { error } = await admin.from("fgts_guias_consultas").upsert({
    company_id: companyId,
    consultado_em: new Date().toISOString(),
    status: resultado.status,
    erro: resultado.status === "erro" ? resultado.erro.slice(0, 500) : null,
    guias: resultado.status === "sucesso" ? resultado.guias : [],
    qtd_em_aberto: resultado.status === "sucesso" ? resultado.qtdEmAberto : 0,
    valor_em_aberto: resultado.status === "sucesso" ? resultado.valorEmAberto : 0,
    resposta: resultado.resposta,
  });
  if (error) throw new Error(`Falha ao salvar consulta de FGTS: ${error.message}`);
  return resultado;
}
