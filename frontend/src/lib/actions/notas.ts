"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCompanyAccess } from "@/lib/auth";
import { decryptSecret, fromBytea } from "@/lib/certificate";
import { mesCorrenteBrasilia } from "@/lib/competencia";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import type { NfseAmbiente } from "@/lib/types";

export type IssueNfseState =
  | { error?: string; success?: boolean; dpsId?: string }
  | undefined;

const AMBIENTE_MAP: Record<NfseAmbiente, string> = {
  HOMOLOGACAO: "producao_restrita",
  PRODUCAO: "producao",
};

const issueSchema = z.object({
  companyId: uuidLike,
  customerId: uuidLike,
  serviceId: uuidLike,
  amount: z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .transform((v) => Number(v.replace(",", ".")))
    .refine((n) => Number.isFinite(n) && n > 0, "Valor inválido."),
  description: z.string().trim().min(1, "Informe a descrição."),
  competenceDate: z.string().min(1, "Informe a data."),
});

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

async function logNfseError(
  companyId: string,
  dpsId: string | null,
  technicalMessage: string,
  userMessage: string,
) {
  const supabase = await createClient();
  await supabase.from("nfse_errors").insert({
    company_id: companyId,
    dps_id: dpsId,
    technical_message: technicalMessage,
    user_message: userMessage,
  });
}

export async function issueNfse(
  _prevState: IssueNfseState,
  formData: FormData,
): Promise<IssueNfseState> {
  const companyIdRaw = formData.get("companyId");
  if (typeof companyIdRaw !== "string") return { error: "Empresa inválida." };

  const access = await getCompanyAccess(companyIdRaw);
  if (!access) return { error: "Sem acesso a essa empresa." };

  const parsed = issueSchema.safeParse({
    companyId: companyIdRaw,
    customerId: formData.get("customerId"),
    serviceId: formData.get("serviceId"),
    amount: formData.get("amount"),
    description: formData.get("description"),
    competenceDate: formData.get("competenceDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, customerId, serviceId, amount, description, competenceDate } =
    parsed.data;

  const supabase = await createClient();

  const [companyRes, customerRes, serviceRes] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "cnpj, municipal_registration, municipality_ibge_code, nfse_ambiente, dps_series, tax_regime, regime_especial_tributacao, allow_retroactive_emission",
      )
      .eq("id", companyId)
      .single(),
    supabase
      .from("customers")
      .select("cpf_cnpj, name, email, zip_code, address, number, complement, district")
      .eq("id", customerId)
      .single(),
    supabase
      .from("services")
      .select(
        "national_tax_code, municipal_tax_code, nbs, cst_pis_cofins, percentual_total_tributos_federal, percentual_total_tributos_estadual, percentual_total_tributos_municipal, aliquota_pis, aliquota_cofins, retencao_pis_cofins_csll_aliquota, retencao_irrf_aliquota, tipo_retencao_issqn",
      )
      .eq("id", serviceId)
      .single(),
  ]);

  const company = companyRes.data;
  const customer = customerRes.data;
  const service = serviceRes.data;

  if (!company) return { error: "Empresa não encontrada." };
  if (!customer) return { error: "Tomador não encontrado." };
  if (!service) return { error: "Serviço não encontrado." };

  if (!company.cnpj || !company.municipality_ibge_code) {
    return {
      error:
        "Cadastro fiscal incompleto — peça pra SOMA configurar CNPJ e município antes de emitir.",
    };
  }
  if (!company.allow_retroactive_emission && competenceDate.slice(0, 7) !== mesCorrenteBrasilia()) {
    return {
      error:
        "Essa nota está com competência fora do mês corrente. Emissão retroativa está desabilitada para essa empresa — peça pra SOMA habilitar em Dados fiscais se for necessário.",
    };
  }
  if (
    service.percentual_total_tributos_federal == null ||
    service.percentual_total_tributos_estadual == null ||
    service.percentual_total_tributos_municipal == null
  ) {
    return {
      error:
        "Esse serviço ainda não tem a tributação configurada. Peça pra SOMA completar o cadastro do serviço antes de emitir.",
    };
  }

  // Certificado: só o service role lê — nunca passa pela sessão do usuário.
  const admin = createAdminClient();
  const { data: certificate } = await admin
    .from("certificates")
    .select("encrypted_file, encrypted_password, expires_at")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!certificate) {
    return { error: "Essa empresa ainda não tem certificado digital cadastrado." };
  }
  if (new Date(certificate.expires_at).getTime() < Date.now()) {
    return { error: "O certificado digital dessa empresa está vencido." };
  }

  let pfxBase64: string;
  let senha: string;
  try {
    pfxBase64 = decryptSecret(fromBytea(certificate.encrypted_file)).toString("base64");
    senha = decryptSecret(fromBytea(certificate.encrypted_password)).toString("utf8");
  } catch {
    return { error: "Não foi possível preparar o certificado para assinatura." };
  }

  // Numeração atômica — nunca reaproveitada, mesmo se a emissão falhar depois.
  const { data: numeroDps, error: numeroError } = await supabase.rpc(
    "claim_next_dps_number",
    { p_company_id: companyId },
  );
  if (numeroError || numeroDps == null) {
    return { error: "Não foi possível gerar o número da nota. Tente novamente." };
  }

  const payload = {
    prestador: {
      codigo_municipio_ibge: company.municipality_ibge_code,
      cnpj: company.cnpj,
      ambiente: AMBIENTE_MAP[company.nfse_ambiente as NfseAmbiente],
      inscricao_municipal: company.municipal_registration,
      serie_dps: company.dps_series,
      // CST 00 (Simples) x CST 01-07 (apuração própria) precisa bater com
      // isso — empresa fora do Simples não pode ir com opSimpNac=3.
      opcao_simples_nacional: company.tax_regime === "SIMPLES_NACIONAL" ? 3 : 1,
      regime_especial_tributacao: company.regime_especial_tributacao ?? 0,
    },
    certificado: { pfx_base64: pfxBase64, senha },
    numero_dps: numeroDps,
    tomador_documento: customer.cpf_cnpj,
    tomador_nome: customer.name,
    tomador_email: customer.email,
    tomador_cep: customer.zip_code,
    tomador_logradouro: customer.address,
    tomador_numero: customer.number,
    tomador_complemento: customer.complement,
    tomador_bairro: customer.district,
    codigo_tributacao_nacional: service.national_tax_code,
    codigo_tributacao_municipal: service.municipal_tax_code,
    codigo_nbs: service.nbs,
    descricao_servico: description,
    valor_servico: amount,
    data_competencia: competenceDate,
    tipo_retencao_issqn: service.tipo_retencao_issqn ?? 1,
    ...(service.cst_pis_cofins ? { cst_pis_cofins: service.cst_pis_cofins } : {}),
    percentual_total_tributos_federal: service.percentual_total_tributos_federal,
    percentual_total_tributos_estadual: service.percentual_total_tributos_estadual,
    percentual_total_tributos_municipal: service.percentual_total_tributos_municipal,
    ...(service.aliquota_pis != null || service.aliquota_cofins != null
      ? {
          valor_bc_pis_cofins: amount,
          ...(service.aliquota_pis != null
            ? {
                aliquota_pis: service.aliquota_pis,
                valor_pis_proprio: round2((amount * service.aliquota_pis) / 100),
              }
            : {}),
          ...(service.aliquota_cofins != null
            ? {
                aliquota_cofins: service.aliquota_cofins,
                valor_cofins_proprio: round2((amount * service.aliquota_cofins) / 100),
              }
            : {}),
        }
      : {}),
    ...(service.retencao_pis_cofins_csll_aliquota != null
      ? {
          tipo_retencao_pis_cofins: 3,
          valor_retido_contribuicoes_sociais: round2(
            (amount * service.retencao_pis_cofins_csll_aliquota) / 100,
          ),
        }
      : {}),
    ...(service.retencao_irrf_aliquota != null
      ? { valor_retido_irrf: round2((amount * service.retencao_irrf_aliquota) / 100) }
      : {}),
  };

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/emitir`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    await logNfseError(
      companyId,
      null,
      "Falha de conexão com o motor de emissão (NFSE_ENGINE_URL).",
      "Não foi possível emitir esta nota.",
    );
    return { error: "Não foi possível emitir esta nota. Tente novamente em instantes." };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await logNfseError(
      companyId,
      null,
      `HTTP ${response.status} de /notas/emitir: ${body}`,
      "Não foi possível emitir esta nota.",
    );
    return { error: "Não foi possível emitir esta nota. Confira os dados e tente novamente." };
  }

  const resultado = await response.json();

  const { data: dpsRow, error: dpsError } = await supabase
    .from("dps")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      service_id: serviceId,
      numero_dps: numeroDps,
      serie: company.dps_series,
      id_dps: resultado.id_dps,
      valor: amount,
      descricao: description,
      data_competencia: competenceDate,
      status: resultado.sucesso ? "ACCEPTED" : "REJECTED",
      xml_dps_assinado: resultado.xml_dps_assinado,
    })
    .select("id")
    .single();

  if (dpsError || !dpsRow) {
    await logNfseError(
      companyId,
      null,
      `Emissão retornou sucesso=${resultado.sucesso} mas falhou ao gravar dps: ${dpsError?.message}`,
      "Não foi possível emitir esta nota.",
    );
    return {
      error:
        "A nota pode ter sido processada, mas houve um erro ao registrar no sistema. Contate o suporte da SOMA antes de tentar de novo.",
    };
  }

  if (!resultado.sucesso) {
    const detalhes: unknown[] = resultado.erros ?? [];
    const mensagemTecnica =
      detalhes.map((erro) => (typeof erro === "string" ? erro : JSON.stringify(erro))).join(" | ") ||
      "Sefin Nacional recusou a DPS sem detalhe.";
    await logNfseError(
      companyId,
      dpsRow.id,
      mensagemTecnica,
      "Não foi possível emitir esta nota.",
    );
    return {
      error:
        "Não foi possível emitir esta nota — identificamos um problema na emissão. Tente novamente ou entre em contato com o suporte da SOMA.",
    };
  }

  await supabase.from("nfse").insert({
    dps_id: dpsRow.id,
    company_id: companyId,
    access_key: resultado.chave_acesso,
    xml_nfse: resultado.xml_nfse,
  });

  await logAudit({
    companyId,
    action: "ISSUE",
    entity: "nfse",
    entityId: dpsRow.id,
    newValue: { numero_dps: numeroDps, valor: amount, access_key: resultado.chave_acesso },
  });

  revalidatePath(`/empresas/${companyId}`);
  revalidatePath(`/empresas/${companyId}/notas`);
  return { success: true, dpsId: dpsRow.id };
}

export type CancelNfseState = { error?: string; success?: boolean } | undefined;

const cancelSchema = z.object({
  companyId: uuidLike,
  dpsId: uuidLike,
  motivoCodigo: z.enum(["1", "2", "9"]),
  motivoDescricao: z
    .string()
    .trim()
    .min(15, "Descreva o motivo com pelo menos 15 caracteres (exigência do Sefin Nacional).")
    .max(255, "Motivo muito longo (máximo 255 caracteres)."),
});

export async function cancelarNfse(
  _prevState: CancelNfseState,
  formData: FormData,
): Promise<CancelNfseState> {
  const companyIdRaw = formData.get("companyId");
  if (typeof companyIdRaw !== "string") return { error: "Empresa inválida." };

  const access = await getCompanyAccess(companyIdRaw);
  if (!access) return { error: "Sem acesso a essa empresa." };

  const parsed = cancelSchema.safeParse({
    companyId: companyIdRaw,
    dpsId: formData.get("dpsId"),
    motivoCodigo: formData.get("motivoCodigo"),
    motivoDescricao: formData.get("motivoDescricao"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, dpsId, motivoCodigo, motivoDescricao } = parsed.data;

  const supabase = await createClient();

  const [{ data: company }, { data: nfseRow }] = await Promise.all([
    supabase.from("companies").select("cnpj, nfse_ambiente").eq("id", companyId).single(),
    supabase.from("nfse").select("id, access_key, status").eq("dps_id", dpsId).maybeSingle(),
  ]);

  if (!company?.cnpj) return { error: "Empresa sem CNPJ cadastrado." };
  if (!nfseRow) return { error: "Essa nota ainda não tem NFS-e emitida — nada para cancelar." };
  if (!nfseRow.access_key) return { error: "Essa nota não tem chave de acesso registrada." };
  if (nfseRow.status === "CANCELADA") return { error: "Essa nota já está cancelada." };

  const admin = createAdminClient();
  const { data: certificate } = await admin
    .from("certificates")
    .select("encrypted_file, encrypted_password, expires_at")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!certificate) return { error: "Essa empresa ainda não tem certificado digital cadastrado." };
  if (new Date(certificate.expires_at).getTime() < Date.now()) {
    return { error: "O certificado digital dessa empresa está vencido." };
  }

  let pfxBase64: string;
  let senha: string;
  try {
    pfxBase64 = decryptSecret(fromBytea(certificate.encrypted_file)).toString("base64");
    senha = decryptSecret(fromBytea(certificate.encrypted_password)).toString("utf8");
  } catch {
    return { error: "Não foi possível preparar o certificado para assinatura." };
  }

  const payload = {
    certificado: { pfx_base64: pfxBase64, senha },
    ambiente: AMBIENTE_MAP[company.nfse_ambiente as NfseAmbiente],
    chave_nfse: nfseRow.access_key,
    autor_documento: company.cnpj,
    motivo_codigo: motivoCodigo,
    motivo_descricao: motivoDescricao,
  };

  let response: Response;
  try {
    response = await fetch(`${process.env.NFSE_ENGINE_URL}/notas/cancelar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.NFSE_ENGINE_INTERNAL_TOKEN ?? "",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    await logNfseError(
      companyId,
      dpsId,
      "Falha de conexão com o motor de emissão ao tentar cancelar (NFSE_ENGINE_URL).",
      "Não foi possível cancelar esta nota.",
    );
    return { error: "Não foi possível cancelar esta nota. Tente novamente em instantes." };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    await logNfseError(
      companyId,
      dpsId,
      `HTTP ${response.status} de /notas/cancelar: ${body}`,
      "Não foi possível cancelar esta nota.",
    );
    return { error: "Não foi possível cancelar esta nota. Confira os dados e tente novamente." };
  }

  const resultado = await response.json();

  if (!resultado.sucesso) {
    const detalhes: unknown[] = resultado.erros ?? [];
    const mensagemTecnica =
      detalhes.map((erro) => (typeof erro === "string" ? erro : JSON.stringify(erro))).join(" | ") ||
      "Sefin Nacional recusou o cancelamento sem detalhe.";
    await logNfseError(companyId, dpsId, mensagemTecnica, "Não foi possível cancelar esta nota.");
    return {
      error:
        "Não foi possível cancelar esta nota — identificamos um problema no cancelamento. Tente novamente ou entre em contato com o suporte da SOMA.",
    };
  }

  await supabase.from("nfse").update({ status: "CANCELADA" }).eq("id", nfseRow.id);
  await supabase.from("nfse_events").insert({
    nfse_id: nfseRow.id,
    type: "CANCELAMENTO",
    reason: motivoDescricao,
  });

  await logAudit({
    companyId,
    action: "CANCEL",
    entity: "nfse",
    entityId: nfseRow.id,
    newValue: { motivo_codigo: motivoCodigo, motivo_descricao: motivoDescricao },
  });

  revalidatePath(`/empresas/${companyId}/notas`);
  revalidatePath(`/empresas/${companyId}/notas/${dpsId}`);
  return { success: true };
}
