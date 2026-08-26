"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSomaStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { buscarDadosCnpj, type DadosCnpj } from "@/lib/cnpj-lookup";
import type { ActionState } from "@/lib/actions/auth";

export async function buscarCnpjAction(
  cnpj: string,
): Promise<{ data: DadosCnpj } | { error: string }> {
  await requireSomaStaff();
  const digits = cnpj.replace(/\D/g, "");
  return buscarDadosCnpj(digits);
}

const taxRegimeEnum = z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]);

const createCompanySchema = z.object({
  organizationName: z.string().trim().min(2, "Informe o nome da empresa/organização."),
  legalName: z.string().trim().min(2, "Informe a razão social."),
  tradeName: z.string().trim().optional(),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  cnae: z.string().trim().optional(),
  municipalityIbgeCode: z.string().trim().optional(),
  taxRegime: taxRegimeEnum.optional().or(z.literal("")),
});

export async function createCompany(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = createCompanySchema.safeParse({
    organizationName: formData.get("organizationName"),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    cnae: formData.get("cnae") || undefined,
    municipalityIbgeCode: formData.get("municipalityIbgeCode") || undefined,
    taxRegime: formData.get("taxRegime") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: parsed.data.organizationName })
    .select("id")
    .single();
  if (orgError || !org) {
    return { error: "Não foi possível criar a organização." };
  }

  const { data: company, error: companyError } = await supabase
    .from("companies")
    .insert({
      organization_id: org.id,
      legal_name: parsed.data.legalName,
      trade_name: parsed.data.tradeName || null,
      cnpj: parsed.data.cnpj || null,
      cnae: parsed.data.cnae || null,
      municipality_ibge_code: parsed.data.municipalityIbgeCode || null,
      tax_regime: parsed.data.taxRegime || null,
    })
    .select("id")
    .single();
  if (companyError || !company) {
    return {
      error:
        companyError?.code === "23505"
          ? "Já existe uma empresa cadastrada com esse CNPJ."
          : "Não foi possível criar a empresa.",
    };
  }

  await logAudit({
    companyId: company.id,
    action: "CREATE",
    entity: "company",
    entityId: company.id,
    newValue: { legal_name: parsed.data.legalName, cnpj: parsed.data.cnpj ?? null },
  });

  revalidatePath("/admin/empresas");
  redirect(`/admin/empresas/${company.id}`);
}

const updateIdentitySchema = z.object({
  companyId: uuidLike,
  legalName: z.string().trim().min(2, "Informe a razão social."),
  tradeName: z.string().trim().optional(),
});

export async function updateCompanyIdentity(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = updateIdentitySchema.safeParse({
    companyId: formData.get("companyId"),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, legalName, tradeName } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("companies")
    .select("legal_name, trade_name")
    .eq("id", companyId)
    .single();

  const { error } = await supabase
    .from("companies")
    .update({ legal_name: legalName, trade_name: tradeName || null })
    .eq("id", companyId);
  if (error) return { error: "Não foi possível salvar o nome da empresa." };

  await logAudit({
    companyId,
    action: "UPDATE",
    entity: "company_identity",
    entityId: companyId,
    oldValue: before,
    newValue: { legal_name: legalName, trade_name: tradeName || null },
  });

  revalidatePath(`/admin/empresas/${companyId}`);
  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  revalidatePath("/admin/empresas");
  return { success: true };
}

const IMPORT_EMPRESAS_THROTTLE_MS = 350;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizarCabecalho(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function encontrarColuna(linha: Record<string, unknown>, candidatos: string[]): unknown {
  const chaves = Object.keys(linha);
  for (const candidato of candidatos) {
    const chave = chaves.find((k) => normalizarCabecalho(k) === candidato);
    if (chave) return linha[chave];
  }
  return undefined;
}

export type ImportarEmpresasState =
  | {
      error?: string;
      resultado?: {
        importadas: number;
        ignoradas: number;
        erros: { linha: string; motivo: string }[];
      };
    }
  | undefined;

export async function importarEmpresasPlanilha(
  _prevState: ImportarEmpresasState,
  formData: FormData,
): Promise<ImportarEmpresasState> {
  await requireSomaStaff();

  const arquivo = formData.get("file");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { error: "Selecione uma planilha (.xlsx, .xls ou .csv)." };
  }

  const XLSX = await import("xlsx");
  let linhas: Record<string, unknown>[];
  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const primeiraAba = workbook.SheetNames[0];
    linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { defval: "" });
  } catch {
    return { error: "Não foi possível ler essa planilha. Confira o formato do arquivo." };
  }

  if (linhas.length === 0) {
    return { error: "A planilha está vazia." };
  }

  const supabase = await createClient();
  const erros: { linha: string; motivo: string }[] = [];
  const vistosNoLote = new Set<string>();
  let importadas = 0;
  let ignoradas = 0;

  for (let i = 0; i < linhas.length; i++) {
    const numeroLinha = `linha ${i + 2}`; // +2: cabeçalho + índice 1-based
    const linha = linhas[i];

    const nomeBruto = encontrarColuna(linha, ["nome", "empresa", "razao social", "razaosocial"]);
    const cnpjBruto = encontrarColuna(linha, ["cnpj"]);
    const nome = String(nomeBruto ?? "").trim();
    const cnpjDigits = String(cnpjBruto ?? "").replace(/\D/g, "");

    if (!cnpjDigits) {
      erros.push({ linha: numeroLinha, motivo: "Sem CNPJ preenchido." });
      continue;
    }
    if (cnpjDigits.length !== 14) {
      erros.push({ linha: numeroLinha, motivo: `CNPJ "${cnpjBruto}" inválido (precisa ter 14 dígitos).` });
      continue;
    }
    if (vistosNoLote.has(cnpjDigits)) {
      ignoradas += 1;
      continue;
    }
    vistosNoLote.add(cnpjDigits);

    const { data: existente } = await supabase
      .from("companies")
      .select("id")
      .eq("cnpj", cnpjDigits)
      .maybeSingle();
    if (existente) {
      ignoradas += 1;
      continue;
    }

    const lookup = await buscarDadosCnpj(cnpjDigits);
    await sleep(IMPORT_EMPRESAS_THROTTLE_MS);

    const dados = "data" in lookup ? lookup.data : null;
    const legalName = dados?.razaoSocial || nome;
    if (!legalName) {
      erros.push({
        linha: numeroLinha,
        motivo: "data" in lookup ? "Sem nome nem razão social." : lookup.error,
      });
      continue;
    }

    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .insert({ name: nome || legalName })
      .select("id")
      .single();
    if (orgError || !org) {
      erros.push({ linha: numeroLinha, motivo: "Não foi possível criar a organização." });
      continue;
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        organization_id: org.id,
        legal_name: legalName,
        trade_name: dados?.nomeFantasia || null,
        cnpj: cnpjDigits,
        cnae: dados?.cnae || null,
        municipality_ibge_code: dados?.municipioIbge || null,
        tax_regime: dados?.simplesNacional ? "SIMPLES_NACIONAL" : null,
      })
      .select("id")
      .single();
    if (companyError || !company) {
      erros.push({
        linha: numeroLinha,
        motivo:
          companyError?.code === "23505"
            ? "Já existe uma empresa com esse CNPJ."
            : "Não foi possível criar a empresa.",
      });
      continue;
    }

    await logAudit({
      companyId: company.id,
      action: "CREATE",
      entity: "company",
      entityId: company.id,
      newValue: { legal_name: legalName, cnpj: cnpjDigits, origem: "importacao_planilha" },
    });

    importadas += 1;
  }

  revalidatePath("/admin/empresas");
  return { resultado: { importadas, ignoradas, erros } };
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  fullName: z.string().trim().min(2, "Informe o nome."),
  role: z.enum(["SUPER_ADMIN", "ADMIN_SOMA", "ADMIN_CLIENTE", "EMISSOR"]),
  companyId: uuidLike,
});

export async function inviteUserToCompany(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    companyId: formData.get("companyId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { email, fullName, role, companyId } = parsed.data;

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { data: invited, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${siteUrl}/auth/confirm?next=/redefinir-senha`,
    });

  let userId = invited?.user?.id;

  // Usuário já existe no Auth (ex.: acesso a outra empresa) — busca o id dele.
  if (inviteError) {
    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!existing) {
      return { error: "Não foi possível convidar esse e-mail." };
    }
    userId = existing.id;
  }

  if (!userId) {
    return { error: "Não foi possível identificar o usuário convidado." };
  }

  const supabase = await createClient();
  const { error: linkError } = await supabase
    .from("user_companies")
    .insert({ user_id: userId, company_id: companyId, role });

  if (linkError) {
    return {
      error:
        linkError.code === "23505"
          ? "Esse usuário já tem acesso a essa empresa."
          : "Não foi possível vincular o usuário à empresa.",
    };
  }

  await logAudit({
    companyId,
    action: "INVITE",
    entity: "user_companies",
    entityId: userId,
    newValue: { email, role },
  });

  revalidatePath(`/admin/empresas/${companyId}`);
  return { success: true };
}

const percentualParaFracao = (v: string | undefined) =>
  v ? Number(v.replace(",", ".")) / 100 : undefined;

const updateFiscalSchema = z.object({
  companyId: uuidLike,
  municipalRegistration: z.string().trim().optional(),
  dataAbertura: z.string().trim().optional(),
  taxRegime: z.enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL"]).optional(),
  cnae: z.string().trim().optional(),
  municipalityIbgeCode: z.string().trim().optional(),
  nfseAmbiente: z.enum(["HOMOLOGACAO", "PRODUCAO"]),
  dpsSeries: z.string().trim().min(1, "Informe a série."),
  dpsNextNumber: z.coerce.number().int().min(1, "Precisa ser maior que zero."),
  regimeEspecialTributacao: z.coerce.number().int().min(0).max(6),
  allowRetroactiveEmission: z.boolean(),
  sujeitoFatorR: z.boolean(),
  irpjCsllApuracaoMensal: z.boolean(),
  issAliquotaPadrao: z.string().optional().transform(percentualParaFracao),
});

export async function updateCompanyFiscal(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSomaStaff();

  const parsed = updateFiscalSchema.safeParse({
    companyId: formData.get("companyId"),
    municipalRegistration: formData.get("municipalRegistration") || undefined,
    dataAbertura: formData.get("dataAbertura") || undefined,
    taxRegime: formData.get("taxRegime") || undefined,
    cnae: formData.get("cnae") || undefined,
    municipalityIbgeCode: formData.get("municipalityIbgeCode") || undefined,
    nfseAmbiente: formData.get("nfseAmbiente"),
    dpsSeries: formData.get("dpsSeries"),
    dpsNextNumber: formData.get("dpsNextNumber"),
    regimeEspecialTributacao: formData.get("regimeEspecialTributacao"),
    allowRetroactiveEmission: formData.get("allowRetroactiveEmission") === "on",
    sujeitoFatorR: formData.get("sujeitoFatorR") === "on",
    irpjCsllApuracaoMensal: formData.get("irpjCsllApuracaoMensal") === "on",
    issAliquotaPadrao: formData.get("issAliquotaPadrao") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { companyId, ...rest } = parsed.data;

  const supabase = await createClient();

  const { data: before } = await supabase
    .from("companies")
    .select(
      "municipal_registration, data_abertura, tax_regime, cnae, municipality_ibge_code, nfse_ambiente, dps_series, dps_next_number, regime_especial_tributacao, allow_retroactive_emission, sujeito_fator_r, irpj_csll_apuracao_mensal, iss_aliquota_padrao",
    )
    .eq("id", companyId)
    .single();

  const newValue = {
    municipal_registration: rest.municipalRegistration || null,
    data_abertura: rest.dataAbertura || null,
    tax_regime: rest.taxRegime || null,
    cnae: rest.cnae || null,
    municipality_ibge_code: rest.municipalityIbgeCode || null,
    nfse_ambiente: rest.nfseAmbiente,
    dps_series: rest.dpsSeries,
    dps_next_number: rest.dpsNextNumber,
    regime_especial_tributacao: rest.regimeEspecialTributacao,
    allow_retroactive_emission: rest.allowRetroactiveEmission,
    sujeito_fator_r: rest.sujeitoFatorR,
    irpj_csll_apuracao_mensal: rest.irpjCsllApuracaoMensal,
    iss_aliquota_padrao: rest.issAliquotaPadrao ?? null,
  };

  const { error } = await supabase.from("companies").update(newValue).eq("id", companyId);

  if (error) return { error: "Não foi possível salvar os dados fiscais." };

  await logAudit({
    companyId,
    action: "UPDATE",
    entity: "company_fiscal",
    entityId: companyId,
    oldValue: before,
    newValue,
  });

  revalidatePath(`/admin/empresas/${companyId}/dados-fiscais`);
  return { success: true };
}
