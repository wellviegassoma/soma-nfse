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
// Escanear tudo desde o NSU 0 em toda busca (em vez de usar um
// checkpoint) foi testado e funcionou bem enquanto as empresas tinham
// poucos documentos — mas empresas com histórico grande (1000+
// documentos já distribuídos) precisam de muitos lotes pra chegar até
// o fim, e cada lote é uma chamada ao adn.nfse.gov.br: quando o Sefin
// está lento, isso estoura o timeout de 45s bem antes de terminar
// (visto em produção repetidamente em empresas de alto volume). Por
// isso o checkpoint voltou: `nsu_inicial` agora usa
// `company.ultimo_nsu_distribuicao` por padrão pra "Buscar agora" no
// mês corrente, escaneando só o que é novo desde a última sincronização
// bem-sucedida. Continuam escaneando do zero (nsu_inicial=0), sempre:
// a busca de histórico ("Buscar últimos 12 meses", `mesesAnteriores>0`,
// que precisa ver NSUs antigos que o checkpoint já passou), a busca de
// uma competência passada (mesmo motivo), e o parâmetro explícito
// `forcarDesdeZero` (botão "Buscar tudo novamente" — a válvula de
// escape manual pro risco de um checkpoint antigo apontar pro lugar
// errado, sem precisar reverter esse código de novo). O dedup por
// chave_acesso (ignoreDuplicates no upsert) torna reprocessar notas já
// vistas seguro e barato dos dois jeitos.
const MAX_LOTES_BUSCA = 150;

// Timeout padrão do fetch ao backend — usado por syncAllCompanies
// (cron / "Buscar todas agora"), onde uma empresa travada não pode
// comer o orçamento de tempo do lote inteiro. Um `timeoutMs` maior,
// passado por quem chama syncOneCompany fora desse contexto de lote
// (ver TIMEOUT_BUSCA_INDIVIDUAL_MS em actions/fechamento.ts), sobrepõe
// esse padrão.
const TIMEOUT_LOTE_MS = 45_000;

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

// Nota nova (não existia antes no banco) cuja competência declarada não
// bate com o mês/ano da data de emissão real — sinal de que o imposto
// dela pode cair retroativamente num período que já foi fechado.
export type NotaDivergente = {
  chaveAcesso: string | null;
  numero: string | null;
  competencia: string | null;
  dataEmissao: string | null;
  valorServico: number | null;
  tomadorNome: string | null;
  prestadorNome: string | null;
};

export type ResultadoSincronizacao = {
  companyId: string;
  status: "sucesso" | "erro" | "pulado";
  notas?: number;
  notasNovas?: number;
  notasDivergentes?: NotaDivergente[];
  erro?: string;
};

export async function syncOneCompany(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  company: CompanyParaSincronizar,
  competencia?: string, // "YYYY-MM" — se omitido, usa o mês corrente
  mesesAnteriores?: number, // >0 = busca de histórico (janela de N+1 meses)
  forcarDesdeZero?: boolean, // true = ignora o checkpoint, escaneia do NSU 0
  timeoutMs?: number, // default TIMEOUT_LOTE_MS — ver comentário na constante
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

    // Checkpoint só é seguro pra busca do mês corrente sem janela de
    // histórico — uma competência passada ou "últimos N meses" precisa
    // enxergar NSUs antigos que o checkpoint já deixou pra trás.
    const usaCheckpoint = !forcarDesdeZero && !mesesAnteriores && competenciaAlvo === mesCorrente;
    const nsuInicial = usaCheckpoint ? company.ultimo_nsu_distribuicao ?? 0 : 0;

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
        nsu_inicial: nsuInicial,
        max_lotes: MAX_LOTES_BUSCA,
        cnpj_consulta: documentoConsulta,
        meses_anteriores: mesesAnteriores ?? 0,
      }),
      cache: "no-store",
      // Sem isso, uma empresa cujo adn.nfse.gov.br trava (já visto em
      // produção — ver HTTP 408 registrado em ultima_sincronizacao_erro)
      // prende o fetch indefinidamente. Como syncAllCompanies processa o
      // lote em sequência dentro de uma função serverless com
      // maxDuration, isso já travou o cron inteiro: a função é matada
      // pela plataforma no meio do await, antes de devolver resposta —
      // e o after() que dispararia o próximo lote nunca chega a ser
      // registrado, silenciando o resto do agendamento. Por isso o
      // padrão (usado por syncAllCompanies/cron) fica curto — `timeoutMs`
      // deixa o "Buscar agora" de uma única empresa (que tem seu próprio
      // orçamento de até 300s na página, sem risco de travar outras
      // empresas de um lote) usar uma janela bem maior: necessário pra
      // uma empresa com backlog grande nunca ter conseguido completar
      // uma varredura sequer (o throttle de 1,5s entre lotes no backend
      // some rápido no total) — sem completar uma vez, o checkpoint
      // nunca avança e ela fica presa reiniciando do mesmo lugar pra
      // sempre. Caso real: a META, com uns 1000-5000 documentos represados.
      signal: AbortSignal.timeout(timeoutMs ?? TIMEOUT_LOTE_MS),
    });

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => "");
      throw new Error(`HTTP ${resp.status}: ${detalhe.slice(0, 300)}`);
    }

    const body: { notas: NotaBuscada[]; ultimo_nsu: number } = await resp.json();
    let notasNovas = 0;
    let notasDivergentes: NotaDivergente[] = [];

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
      // sobrescrita (chave_acesso é o identificador estável). Com
      // ON CONFLICT DO NOTHING, o RETURNING (via .select()) só traz de
      // volta as linhas realmente inseridas agora — as duplicadas
      // ignoradas não aparecem — então dá pra saber exatamente quais
      // notas são novas nesta sincronização, sem round-trip extra.
      const { data: linhasInseridas, error: upsertError } = await admin
        .from("notas_distribuidas")
        .upsert(linhas, { onConflict: "company_id,chave_acesso", ignoreDuplicates: true })
        .select("chave_acesso, numero, competencia, data_emissao, bate_competencia, valor_servico, tomador_nome, prestador_nome");
      if (upsertError) throw new Error(`Falha ao salvar notas: ${upsertError.message}`);

      notasNovas = linhasInseridas?.length ?? 0;
      notasDivergentes = (linhasInseridas ?? [])
        .filter((n) => n.bate_competencia === false)
        .map((n) => ({
          chaveAcesso: n.chave_acesso,
          numero: n.numero,
          competencia: n.competencia,
          dataEmissao: n.data_emissao,
          valorServico: n.valor_servico,
          tomadorNome: n.tomador_nome,
          prestadorNome: n.prestador_nome,
        }));
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

    return {
      companyId: company.id,
      status: "sucesso",
      notas: body.notas.length,
      notasNovas,
      notasDivergentes,
    };
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
  // Offset real de onde o próximo lote deve continuar — normalmente
  // paginacao.offset + o tamanho do lote, mas quando o orçamento de
  // tempo estoura no meio do lote (ver LIMITE_TEMPO_LOTE_MS abaixo),
  // reflete só o que de fato foi processado, pra ninguém ficar pulado.
  proximoOffset?: number;
};

// Deixa uma folga generosa dentro do maxDuration=300s da função
// serverless do cron: se processar o lote inteiro (TAMANHO_LOTE
// empresas) está demorando demais — uma delas travando o
// adn.nfse.gov.br, por exemplo — para de pegar empresa nova e devolve
// a resposta AGORA, com o offset real de onde parou. Sem isso, a
// função corria risco de ser matada pela plataforma no meio do loop,
// antes de conseguir devolver resposta e dar tempo do `after()` (que
// dispara o próximo lote) ser registrado — foi exatamente esse o jeito
// como o agendamento automático ficou travado silenciosamente em
// produção.
const LIMITE_TEMPO_LOTE_MS = 240_000;

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
    .eq("ativa", true)
    .order("id");
  if (paginacao) {
    query = query.range(paginacao.offset, paginacao.offset + paginacao.limite - 1);
  }
  const { data: companies, count } = await query;

  const inicio = Date.now();
  const resultados: ResultadoSincronizacao[] = [];
  let processadas = 0;
  for (const company of companies ?? []) {
    resultados.push(
      await syncOneCompany(admin, company as CompanyParaSincronizar, competencia, mesesAnteriores),
    );
    processadas += 1;
    if (paginacao && Date.now() - inicio > LIMITE_TEMPO_LOTE_MS) break;
  }

  const totalEmpresas = count ?? resultados.length;
  const proximoOffset = paginacao ? paginacao.offset + processadas : undefined;
  const temMais = paginacao ? (proximoOffset as number) < totalEmpresas : false;
  return { resultados, totalEmpresas, temMais, proximoOffset };
}

export { MESES_ANTERIORES_HISTORICO };
