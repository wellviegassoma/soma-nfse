import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { documentoEmpresa } from "@/lib/formatters";
import type { NfseAmbiente } from "@/lib/types";

const AMBIENTE_MAP: Record<NfseAmbiente, string> = {
  HOMOLOGACAO: "producao_restrita",
  PRODUCAO: "producao",
};

// A causa real de uma nota real ter ficado de fora mesmo depois de
// "buscar agora" de novo era um bug de paginação em
// backend/nfse_client.py (avançava o NSU com +1 a mais do que devia,
// pulando sempre o documento bem na fronteira de cada página de ~50 —
// ver o comentário lá pra o diagnóstico completo). Já corrigido.
//
// Além disso, confirmado ao vivo que o NSU não é um índice que só
// cresce pra sempre — é a posição dentro de uma janela de documentos
// disponíveis pra consulta que parece ter um teto (pra uma empresa
// real, só ~384 documentos disponíveis no total, não milhares, mesmo
// a empresa existindo desde 2018). Com isso, escanear tudo desde o NSU
// 0 em toda busca (em vez de guardar um checkpoint e só revisitar uma
// janela recente, como este arquivo fazia antes) deixou de ser caro:
// testado ao vivo, escanear tudo levou ~16s — bem mais rápido do que a
// suposição antiga de que isso demoraria minutos. Removida a lógica de
// checkpoint/janela: mais simples e sem risco de um checkpoint antigo
// apontar pra um lugar errado. O dedup por chave_acesso (ignoreDuplicates
// no upsert) já torna reprocessar tudo seguro e barato.
const MAX_LOTES_BUSCA = 150;

// Meses considerados por "Buscar últimos 12 meses" — janela de N+1
// meses terminando no mês corrente (ver meses_anteriores no backend).
const MESES_ANTERIORES_HISTORICO = 11;

type NotaBuscada = {
  nsu: string;
  chave_acesso: string | null;
  data_emissao: string | null;
  xml: string;
  prestador_cnpj: string | null;
  tomador_cnpj: string | null;
  numero: string | null;
  competencia: string | null;
  tomador_nome: string | null;
  prestador_nome: string | null;
  descricao_servico: string | null;
  local_incidencia: string | null;
  codigo_trib_nacional: string | null;
  codigo_nbs: string | null;
  aliquota_issqn: number | null;
  valor_servico: number | null;
  valor_issqn: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_ret_cp: number | null;
  valor_ret_irrf: number | null;
  valor_ret_csll: number | null;
  cancelada: boolean;
  motivo_cancelamento: string | null;
  bate_competencia: boolean;
};

type CompanyParaSincronizar = {
  id: string;
  cnpj: string | null;
  cpf: string | null;
  nfse_ambiente: string;
  ultimo_nsu_distribuicao?: number | null;
  certificates:
    | { encrypted_file: string; encrypted_password: string; expires_at: string }
    | { encrypted_file: string; encrypted_password: string; expires_at: string }[]
    | null;
};

export type ResultadoSincronizacao = {
  companyId: string;
  status: "sucesso" | "erro" | "pulado";
  notas?: number;
  erro?: string;
};

export async function syncOneCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  company: CompanyParaSincronizar,
  competencia?: string, // "YYYY-MM" — se omitido, usa o mês corrente
  mesesAnteriores?: number, // >0 = busca de histórico (janela de N+1 meses)
): Promise<ResultadoSincronizacao> {
  const certificado = Array.isArray(company.certificates)
    ? company.certificates[0]
    : company.certificates;

  const documentoConsulta = documentoEmpresa(company);
  if (!documentoConsulta || !certificado) {
    return { companyId: company.id, status: "pulado", erro: "sem certificado cadastrado" };
  }
  if (new Date(certificado.expires_at).getTime() < Date.now()) {
    await admin
      .from("companies")
      .update({
        ultima_sincronizacao_em: new Date().toISOString(),
        ultima_sincronizacao_status: "erro",
        ultima_sincronizacao_erro: "Certificado digital vencido.",
      })
      .eq("id", company.id);
    return { companyId: company.id, status: "erro", erro: "certificado vencido" };
  }

  try {
    const pfxBase64 = decryptSecret(fromBytea(certificado.encrypted_file)).toString("base64");
    const senha = decryptSecret(fromBytea(certificado.encrypted_password)).toString("utf8");
    const ambiente = AMBIENTE_MAP[company.nfse_ambiente as NfseAmbiente];

    const mesCorrente = mesCorrenteBrasilia();
    const competenciaAlvo = competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : mesCorrente;
    const [anoAlvo, mesAlvo] = competenciaAlvo.split("-").map(Number);

    const resp = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/buscar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        certificado: { pfx_base64: pfxBase64, senha },
        ambiente,
        ano: anoAlvo,
        mes: mesAlvo,
        nsu_inicial: 0,
        max_lotes: MAX_LOTES_BUSCA,
        cnpj_consulta: documentoConsulta,
        meses_anteriores: mesesAnteriores ?? 0,
      }),
      cache: "no-store",
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${detalhe.slice(0, 300)}`);
    }

    const body: { notas: NotaBuscada[]; ultimo_nsu: number } = await resp.json();

    if (body.notas.length > 0) {
      const linhas = body.notas.map((n) => ({
        company_id: company.id,
        nsu: Number(n.nsu),
        chave_acesso: n.chave_acesso,
        direcao: classificarDirecao(n.prestador_cnpj, n.tomador_cnpj, documentoConsulta),
        cancelada: n.cancelada,
        motivo_cancelamento: n.motivo_cancelamento,
        numero: n.numero,
        data_emissao: n.data_emissao,
        competencia: n.competencia,
        bate_competencia: n.bate_competencia,
        prestador_cnpj: n.prestador_cnpj,
        prestador_nome: n.prestador_nome,
        tomador_cnpj: n.tomador_cnpj,
        tomador_nome: n.tomador_nome,
        descricao_servico: n.descricao_servico,
        local_incidencia: n.local_incidencia,
        codigo_trib_nacional: n.codigo_trib_nacional,
        codigo_nbs: n.codigo_nbs,
        aliquota_issqn: n.aliquota_issqn,
        valor_servico: n.valor_servico,
        valor_issqn: n.valor_issqn,
        valor_pis: n.valor_pis,
        valor_cofins: n.valor_cofins,
        valor_ret_cp: n.valor_ret_cp,
        valor_ret_irrf: n.valor_ret_irrf,
        valor_ret_csll: n.valor_ret_csll,
        xml: n.xml,
      }));

      // ignoreDuplicates: uma nota já sincronizada num dia anterior não é
      // sobrescrita (chave_acesso é o identificador estável).
      const { error: upsertError } = await admin
        .from("notas_distribuidas")
        .upsert(linhas, { onConflict: "company_id,chave_acesso", ignoreDuplicates: true });
      if (upsertError) throw new Error(`Falha ao salvar notas: ${upsertError.message}`);
    }

    // ultimo_nsu_distribuicao não decide mais de onde a próxima busca
    // começa (toda busca escaneia do NSU 0 — ver comentário no topo do
    // arquivo) — guardado só como informação de diagnóstico.
    await admin
      .from("companies")
      .update({
        ultimo_nsu_distribuicao: body.ultimo_nsu,
        ultima_sincronizacao_em: new Date().toISOString(),
        ultima_sincronizacao_status: "sucesso",
        ultima_sincronizacao_erro: null,
      })
      .eq("id", company.id);

    return { companyId: company.id, status: "sucesso", notas: body.notas.length };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : "Erro desconhecido na sincronização.";
    await admin
      .from("companies")
      .update({
        ultima_sincronizacao_em: new Date().toISOString(),
        ultima_sincronizacao_status: "erro",
        ultima_sincronizacao_erro: mensagem.slice(0, 500),
      })
      .eq("id", company.id);
    return { companyId: company.id, status: "erro", erro: mensagem };
  }
}

export type ResultadoLoteSincronizacao = {
  resultados: ResultadoSincronizacao[];
  totalEmpresas: number;
  temMais: boolean;
};

// Paginação opcional: sem ela, processa TODAS as empresas na mesma
// chamada (uso antigo). Com ela, processa só a fatia pedida e informa se
// ainda sobra empresa — usado pelo cron pra se encadear em lotes, sem
// nenhuma chamada individual chegar perto do tempo limite da função
// serverless (ver `app/api/cron/sync-notas/route.ts`).
export async function syncAllCompanies(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  competencia?: string, // "YYYY-MM" — se omitido, usa o mês corrente
  mesesAnteriores?: number, // >0 = busca de histórico pra todas
  paginacao?: { offset: number; limite: number },
): Promise<ResultadoLoteSincronizacao> {
  let query = admin
    .from("companies")
    .select(
      "id, cnpj, cpf, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
      { count: "exact" },
    )
    .order("id");
  if (paginacao) {
    query = query.range(paginacao.offset, paginacao.offset + paginacao.limite - 1);
  }
  const { data: companies, count } = await query;

  const resultados: ResultadoSincronizacao[] = [];
  for (const company of companies ?? []) {
    resultados.push(
      await syncOneCompany(admin, company as CompanyParaSincronizar, competencia, mesesAnteriores),
    );
  }

  const totalEmpresas = count ?? resultados.length;
  const temMais = paginacao ? paginacao.offset + paginacao.limite < totalEmpresas : false;
  return { resultados, totalEmpresas, temMais };
}

export { MESES_ANTERIORES_HISTORICO };
