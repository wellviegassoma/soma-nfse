import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import type { NfseAmbiente } from "@/lib/types";

const AMBIENTE_MAP: Record<NfseAmbiente, string> = {
  HOMOLOGACAO: "producao_restrita",
  PRODUCAO: "producao",
};

// A distribuição por NSU filtra localmente por (ano, mês) e um
// documento fora do filtro não fica "guardado" pra próxima vez, então
// resumir cegamente do último checkpoint arriscava nunca pegar uma nota
// que apareceu fora de ordem na distribuição.
//
// A solução ingênua (voltar pro NSU 0 toda vez) foi tentada e revertida:
// pra uma empresa já em NSU ~650, escanear tudo de novo leva ~16min só
// de espera entre chamadas (throttle de 1.5s por chamada no cliente do
// Sefin Nacional) — estoura o tempo máximo da function e foi a causa
// real de vários "falha no handshake TLS" que pareciam instabilidade do
// governo, mas eram a nossa própria varredura sendo cortada no meio.
//
// Em vez disso: revisita uma JANELA recente e limitada a partir do
// checkpoint (não o histórico inteiro) — cobre o risco real (nota
// chegando fora de ordem há pouco tempo) sem crescer pra sempre.
// Empresa nova (checkpoint 0) começa do zero normalmente.
//
// Números calibrados pro throttle de 1.5s/chamada do cliente do Sefin
// Nacional: 80 lotes ≈ 2min por empresa — dá pra rodar "buscar todas"
// com poucas empresas dentro do maxDuration abaixo. Se o número de
// clientes crescer bastante, ou o volume de notas por dia crescer muito
// além de umas dezenas, revisar esses números (ou trocar pra fan-out —
// uma invocação por empresa em vez de laço sequencial).
const JANELA_REVISITADA = 60;
const MAX_LOTES_POR_EMPRESA = 80;

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
  cancelada: boolean;
  motivo_cancelamento: string | null;
  bate_competencia: boolean;
};

type CompanyParaSincronizar = {
  id: string;
  cnpj: string | null;
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncOneCompany(
  admin: SupabaseClient<any, any, any>,
  company: CompanyParaSincronizar,
): Promise<ResultadoSincronizacao> {
  const certificado = Array.isArray(company.certificates)
    ? company.certificates[0]
    : company.certificates;

  if (!company.cnpj || !certificado) {
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

    const hoje = new Date();
    const resp = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/buscar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify({
        certificado: { pfx_base64: pfxBase64, senha },
        ambiente,
        ano: hoje.getUTCFullYear(),
        mes: hoje.getUTCMonth() + 1,
        nsu_inicial: Math.max(0, (company.ultimo_nsu_distribuicao ?? 0) - JANELA_REVISITADA),
        max_lotes: MAX_LOTES_POR_EMPRESA,
        cnpj_consulta: company.cnpj,
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
        direcao: classificarDirecao(n.prestador_cnpj, n.tomador_cnpj, company.cnpj),
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
        xml: n.xml,
      }));

      // ignoreDuplicates: uma nota já sincronizada num dia anterior não é
      // sobrescrita (chave_acesso é o identificador estável).
      const { error: upsertError } = await admin
        .from("notas_distribuidas")
        .upsert(linhas, { onConflict: "company_id,chave_acesso", ignoreDuplicates: true });
      if (upsertError) throw new Error(`Falha ao salvar notas: ${upsertError.message}`);
    }

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncAllCompanies(
  admin: SupabaseClient<any, any, any>,
): Promise<ResultadoSincronizacao[]> {
  const { data: companies } = await admin
    .from("companies")
    .select(
      "id, cnpj, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    );

  const resultados: ResultadoSincronizacao[] = [];
  for (const company of companies ?? []) {
    resultados.push(await syncOneCompany(admin, company as CompanyParaSincronizar));
  }
  return resultados;
}
