import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { criptogramaInfosimples } from "@/lib/fgts-infosimples";
import { htmlParaTexto, decodificarEntidades, type MensagemCaixaPostal } from "@/lib/caixa-postal-core";
import { gravarMensagens } from "@/lib/caixa-postal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

// DeC da SEFAZ-RJ (Domicílio Eletrônico do Contribuinte) pela Infosimples —
// consulta "SEFAZ / RJ / DEC / Caixa Postal" (doc na área do cliente,
// conferida em 19/11/2026). Primeira página da caixa postal, com o
// certificado DA PRÓPRIA EMPRESA (o mesmo guardado no SOMA para emitir
// NFS-e) — uso autorizado pelo Wellington em 19/11/2026. Com o da SOMA o
// portal responde "CNPJ ou CPF não consta no cadastro de ICMS do estado do
// Rio de Janeiro": o DeC abre a caixa de quem assina (testado na King Pet,
// inclusive passando a IE).
//
// CIÊNCIA: no DeC, a intimação conta como feita quando alguém abre a
// mensagem (Decreto 45.948/2017). Pela documentação: "Se for informado o
// valor 0, a API abrirá as mensagens não lidas da caixa postal." Por isso
// IGNORA_NAO_LIDAS é fixo em "1": as não lidas vêm só com assunto, data,
// categoria e a data da ciência presumida — sem abrir. As já lidas vêm com o
// texto. Nunca trocar para "0" sem decisão de quem vai tratar.
const IGNORA_NAO_LIDAS = "1";
const URL_CONSULTA = "https://api.infosimples.com/api/v2/consultas/sefaz/rj/dec/caixa-postal";
const TIMEOUT_INFOSIMPLES_S = 240;

export const PREFIXO_DEC = "DEC:";

type Bruto = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** "dd/mm/aaaa[ - ]hh:mm:ss" → ISO em Brasília; só a data → T00:00:00. */
function dataHoraBr(v: unknown): string | null {
  const s = texto(v);
  const m = s?.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\D+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
}

const CATEGORIA_RELEVANTE = /notifica|intima|auto de infra|lan[çc]amento|cobran|exclus|suspens|cancelamento|impedimento/i;

/** Uma mensagem da Infosimples → formato da central (isn "DEC:…"). */
export function mensagemDec(x: Bruto): MensagemCaixaPostal | null {
  const assunto = texto(x.assunto);
  const envio = dataHoraBr(x.envio_data);
  const id = texto(x.identificacao) ?? (assunto && envio ? `${envio}|${assunto}` : null);
  if (!assunto || !id) return null;
  const ciencia = (x.ciencia ?? {}) as Bruto;
  const lida = x.lida === true || x.lida === "true";
  const msg = x.mensagem;
  let corpo: string | null | undefined = undefined;
  if (lida && msg && typeof msg === "object") {
    const m = msg as Bruto;
    corpo = texto(m.conteudo_texto) ?? (texto(m.conteudo_html) ? htmlParaTexto(String(m.conteudo_html)) : null);
    if (corpo) corpo = decodificarEntidades(corpo);
  }
  const categoria = texto(x.categoria) ?? "";
  const cienciaEm = dataHoraBr(ciencia.datahora);
  return {
    isn: `${PREFIXO_DEC}${id}`.slice(0, 200),
    numeroControle: texto(x.n_processo) ?? texto(x.n_objeto),
    assunto: decodificarEntidades([categoria, assunto].filter(Boolean).join(" · ")),
    relevante: CATEGORIA_RELEVANTE.test(categoria) || CATEGORIA_RELEVANTE.test(assunto),
    sistemaRemetente: null,
    codigoModelo: null,
    tipoOrigem: 2,
    descricaoOrigem: ["SEFAZ-RJ · DeC", texto(x.tipo_receita), texto(x.tipo_mensagem)].filter(Boolean).join(" · "),
    enviadaEm: envio,
    lidaEm: lida ? (dataHoraBr(x.data_leitura) ?? (texto(ciencia.tipo) === "Efetiva" ? cienciaEm : null)) : null,
    cienciaEm: cienciaEm ? cienciaEm.slice(0, 10) : null,
    validadeEm: null,
    excluidaEm: null,
    // Guarda só o que identifica a mensagem — sem dados cadastrais do destinatário.
    bruto: {
      identificacao: x.identificacao ?? null,
      categoria: x.categoria ?? null,
      tipo_mensagem: x.tipo_mensagem ?? null,
      tipo_receita: x.tipo_receita ?? null,
      lida: x.lida ?? null,
      ciencia: x.ciencia ?? null,
      autor_leitura: x.autor_leitura ?? null,
      n_processo: x.n_processo ?? null,
      n_objeto: x.n_objeto ?? null,
    },
    corpo,
  };
}

export type ResultadoDec =
  | { ok: true; mensagens: MensagemCaixaPostal[]; naoLidas: number; preco: number | null; ie: string | null }
  | { ok: false; erro: string; semDec: boolean; naoConstaIcms: boolean };

// Respostas que significam "esta empresa não tem DeC acessível pela SOMA"
// (sem inscrição no ICMS-RJ, sem e-Procuração) — não adianta tentar de novo
// toda semana. Erro de instabilidade (timeout etc.) não entra aqui.
const SEM_DEC = /n[ãa]o (possui|h[áa]|foi encontrad|consta|est[áa] credenciad)|sem acesso|procura[çc][ãa]o|n[ãa]o autorizad|inscri[çc][ãa]o|nenhum (contribuinte|resultado)/i;

/** Certificado A1 da própria empresa, válido, decifrado. */
async function certificadoDaEmpresa(
  admin: Supa,
  cnpj: string,
): Promise<{ ok: true; pfxBase64: string; senha: string } | { ok: false; erro: string }> {
  const { data } = await admin
    .from("companies")
    .select("certificates(encrypted_file, encrypted_password, expires_at)")
    .eq("cnpj", cnpj)
    .limit(1)
    .maybeSingle();
  const certs = data?.certificates as
    | { encrypted_file: string; encrypted_password: string; expires_at: string }
    | { encrypted_file: string; encrypted_password: string; expires_at: string }[]
    | null
    | undefined;
  const lista = Array.isArray(certs) ? certs : certs ? [certs] : [];
  const cert = lista
    .filter((c) => new Date(c.expires_at).getTime() > Date.now())
    .sort((a, b) => b.expires_at.localeCompare(a.expires_at))[0];
  if (!cert) return { ok: false, erro: "Empresa sem certificado digital válido no SOMA (o DeC exige o da própria empresa)." };
  return {
    ok: true,
    pfxBase64: decryptSecret(fromBytea(cert.encrypted_file)).toString("base64"),
    senha: decryptSecret(fromBytea(cert.encrypted_password)).toString("utf8"),
  };
}

/** `ie` (inscrição estadual, só dígitos) escolhe o contribuinte pela IE em vez do CNPJ. */
export async function consultarDecRj(admin: Supa, cnpj: string, ie?: string | null): Promise<ResultadoDec> {
  const token = process.env.INFOSIMPLES_TOKEN;
  const chave = process.env.INFOSIMPLES_CHAVE_CRIPTOGRAFIA;
  if (!token || !chave) return { ok: false, erro: "Infosimples não configurada (token/chave).", semDec: false, naoConstaIcms: false };

  const cert = await certificadoDaEmpresa(admin, cnpj);
  if (!cert.ok) return { ok: false, erro: cert.erro, semDec: false, naoConstaIcms: false };

  let body: { code?: number; code_message?: string; errors?: string[]; data?: Bruto[]; header?: Bruto };
  try {
    const resp = await fetch(URL_CONSULTA, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        timeout: String(TIMEOUT_INFOSIMPLES_S),
        pkcs12_cert: criptogramaInfosimples(cert.pfxBase64, chave),
        pkcs12_pass: criptogramaInfosimples(cert.senha, chave),
        ignora_nao_lidas: IGNORA_NAO_LIDAS,
        ...(ie ? { ie } : { cnpj }),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout((TIMEOUT_INFOSIMPLES_S + 15) * 1000),
    });
    const t = await resp.text();
    try {
      body = JSON.parse(t);
    } catch {
      return { ok: false, erro: `Infosimples fora do ar (HTTP ${resp.status}) — tente de novo.`, semDec: false, naoConstaIcms: false };
    }
  } catch (e) {
    return {
      ok: false,
      erro: `Falha ao chamar a Infosimples: ${e instanceof Error ? e.message : String(e)}`,
      semDec: false,
      naoConstaIcms: false,
    };
  }

  const preco = Number((body.header as Bruto | undefined)?.price ?? NaN);
  if (body.code !== 200) {
    const detalhe = [body.code_message, ...(body.errors ?? [])].filter(Boolean).join(" — ");
    return {
      ok: false,
      erro: `Infosimples ${body.code ?? "?"}: ${detalhe || "erro sem mensagem"}`.slice(0, 1000),
      semDec: body.code === 612 || SEM_DEC.test(detalhe),
      naoConstaIcms: /n[ãa]o consta no cadastro de ICMS/i.test(detalhe),
    };
  }
  const d = (body.data ?? [])[0] ?? {};
  const lista = Array.isArray(d.mensagens) ? (d.mensagens as Bruto[]) : [];
  const mensagens = lista.map(mensagemDec).filter((m): m is MensagemCaixaPostal => !!m);
  // A inscrição estadual vem dentro das mensagens já lidas (mensagem.ie).
  const ieEncontrada =
    lista
      .map((x) => (x.mensagem && typeof x.mensagem === "object" ? texto((x.mensagem as Bruto).ie) : null))
      .map((v) => (v ? v.replace(/\D/g, "") : null))
      .find((v): v is string => !!v && v.length >= 6) ?? null;
  return { ok: true, mensagens, naoLidas: Number(d.nao_lidas ?? 0) || 0, preco: Number.isFinite(preco) ? preco : null, ie: ieEncontrada };
}

/** Lê o DeC de uma empresa, grava na central e registra a leitura. */
export async function lerDecRjEmpresa(
  admin: Supa,
  empresa: { id: string; cnpj: string; ie?: string | null },
): Promise<{ ok: true; quantidade: number; novas: number } | { ok: false; erro: string; semDec: boolean }> {
  const r = await consultarDecRj(admin, empresa.cnpj, empresa.ie);
  const agora = new Date().toISOString();
  if (!r.ok) {
    // SEFAZ-RJ: "CNPJ ou CPF não consta no cadastro de ICMS" → ISENTO, mas só
    // se ninguém informou uma inscrição à mão.
    if (r.naoConstaIcms) {
      await admin.from("companies").update({ inscricao_estadual: "ISENTO" }).eq("id", empresa.id).is("inscricao_estadual", null);
    }
    await admin.from("dec_rj_leituras").upsert({
      company_id: empresa.id,
      lida_em: agora,
      ok: false,
      erro: r.erro,
      ...(r.semDec ? { ativo: false } : {}),
    });
    return r;
  }
  const { data: anterior } = await admin
    .from("dec_rj_leituras")
    .select("company_id")
    .eq("company_id", empresa.id)
    .eq("ok", true)
    .maybeSingle();
  const gravado = await gravarMensagens(admin, empresa.id, r.mensagens, {
    primeiraLeitura: !anterior,
    origem: "no DeC da SEFAZ-RJ",
  });
  if (!gravado.ok) return { ...gravado, semDec: false };
  if (r.ie) {
    await admin
      .from("companies")
      .update({ inscricao_estadual: r.ie })
      .eq("id", empresa.id)
      .or("inscricao_estadual.is.null,inscricao_estadual.eq.ISENTO");
  }
  await admin.from("dec_rj_leituras").upsert({
    company_id: empresa.id,
    ativo: true,
    lida_em: agora,
    ok: true,
    erro: null,
    quantidade: r.mensagens.length,
    nao_lidas: r.naoLidas,
    novas: gravado.novas,
  });
  return { ok: true, quantidade: r.mensagens.length, novas: gravado.novas };
}
