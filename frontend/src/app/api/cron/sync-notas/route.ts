import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { classificarDirecao } from "@/lib/notas-distribuidas";
import type { NfseAmbiente } from "@/lib/types";

export const maxDuration = 60;

const AMBIENTE_MAP: Record<NfseAmbiente, string> = {
  HOMOLOGACAO: "producao_restrita",
  PRODUCAO: "producao",
};

// Quantos lotes (até 50 documentos cada) buscar por empresa, por
// execução — limitado pra caber no tempo máximo de uma function do
// Vercel Cron. Rodando 1x/dia, o volume normal de NSUs novos desde
// ontem é pequeno; esse teto só importa pra empresas com backlog grande
// (primeira sincronização), que vão avançar aos poucos, um pouco por
// dia, até alcançar o NSU atual — autocorretivo, não é bloqueio.
//
// Escala atual (poucas empresas) permite rodar tudo sequencialmente
// numa function só. Se o número de clientes crescer muito, trocar por
// um fan-out (uma invocação por empresa) em vez de laço sequencial
// aqui.
const MAX_LOTES_POR_EMPRESA = 15;

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

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: companies } = await admin
    .from("companies")
    .select(
      "id, cnpj, nfse_ambiente, ultimo_nsu_distribuicao, certificates(encrypted_file, encrypted_password, expires_at)",
    );

  const resumo: Array<{ companyId: string; status: string; notas?: number; erro?: string }> = [];

  for (const company of companies ?? []) {
    const certificado = Array.isArray(company.certificates)
      ? company.certificates[0]
      : company.certificates;

    if (!company.cnpj || !certificado) {
      continue; // sem certificado cadastrado — nada a sincronizar
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
      resumo.push({ companyId: company.id, status: "erro", erro: "certificado vencido" });
      continue;
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
          nsu_inicial: company.ultimo_nsu_distribuicao,
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

        // ignoreDuplicates: uma nota já sincronizada num dia anterior não
        // é sobrescrita (chave_acesso é o identificador estável).
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

      resumo.push({ companyId: company.id, status: "sucesso", notas: body.notas.length });
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
      resumo.push({ companyId: company.id, status: "erro", erro: mensagem });
    }
  }

  return NextResponse.json({ resumo });
}
