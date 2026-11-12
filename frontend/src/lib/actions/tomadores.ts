"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, getCompanyAccess, isSomaStaff } from "@/lib/auth";
import { uuidLike } from "@/lib/zod-helpers";
import { extrairTomadorDeXml } from "@/lib/xml-tomador";
import { logAudit } from "@/lib/audit";
import { buscarDadosCep, type DadosCep } from "@/lib/cep-lookup";
import { buscarDadosCnpj } from "@/lib/cnpj-lookup";
import type { ActionState } from "@/lib/actions/auth";

async function requireCompanyMember(companyId: string) {
  await requireUser();
  if (await isSomaStaff()) return;
  const access = await getCompanyAccess(companyId);
  if (!access) throw new Error("Sem acesso a essa empresa.");
}

export async function buscarCepAction(cep: string): Promise<{ data: DadosCep } | { error: string }> {
  await requireUser();
  return buscarDadosCep(cep.replace(/\D/g, ""));
}

export type DadosTomadorBusca = {
  nome?: string;
  email?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, peso: number) => {
    let soma = 0;
    for (const d of base) soma += Number(d) * peso--;
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/**
 * "Buscar dados" do cadastro de tomador.
 * - CNPJ: Receita Federal (BrasilAPI, gratuito) — razão social, endereço, e-mail.
 * - CPF: a Receita não libera nome por CPF de forma pública. Procura o CPF nos
 *   tomadores já cadastrados no sistema: na própria empresa pra qualquer um;
 *   nas outras empresas só pra equipe da SOMA (dado de paciente não vaza
 *   entre clientes no portal).
 */
export async function buscarDadosTomadorAction(
  companyId: string,
  documento: string,
): Promise<{ data: DadosTomadorBusca; origem: string; aviso?: string } | { error: string }> {
  await requireCompanyMember(companyId);
  const doc = documento.replace(/\D/g, "");

  if (doc.length === 14) {
    const r = await buscarDadosCnpj(doc);
    if ("error" in r) return { error: r.error };
    const d = r.data;
    const logradouro = [d.tipoLogradouro, d.logradouro].filter(Boolean).join(" ");
    return {
      origem: "com os dados da Receita Federal",
      aviso: d.ativa ? undefined : `Atenção: CNPJ com situação "${d.situacaoCadastral ?? "não ativa"}" na Receita.`,
      data: {
        nome: d.razaoSocial,
        email: d.email ?? undefined,
        cep: d.cep ?? undefined,
        endereco: logradouro || undefined,
        numero: d.numero ?? undefined,
        complemento: d.complemento ?? undefined,
        bairro: d.bairro ?? undefined,
        cidade: d.municipio ?? undefined,
        uf: d.uf ?? undefined,
      },
    };
  }

  if (doc.length !== 11) return { error: "Digite um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
  if (!cpfValido(doc)) return { error: "CPF inválido — confira os dígitos." };

  const staff = await isSomaStaff();
  const supabase = await createClient();
  let consulta = supabase
    .from("customers")
    .select("company_id, name, email, zip_code, address, number, complement, district, city, state, updated_at")
    .eq("cpf_cnpj", doc)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (!staff) consulta = consulta.eq("company_id", companyId);
  const { data: achados } = await consulta;
  if (!achados || achados.length === 0) {
    return {
      error:
        "A Receita não libera o nome por CPF em consulta pública, e esse CPF ainda não está cadastrado no sistema. Preencha o nome à mão.",
    };
  }
  // O cadastro mais completo (mais campos preenchidos), desempatando pelo mais recente.
  const preenchidos = (c: (typeof achados)[number]) =>
    [c.email, c.zip_code, c.address, c.number, c.district, c.city, c.state].filter(Boolean).length;
  const melhor = [...achados].sort((a, b) => preenchidos(b) - preenchidos(a))[0];
  return {
    origem: melhor.company_id === companyId ? "com o cadastro desta empresa" : "com o cadastro de outra empresa da SOMA",
    data: {
      nome: melhor.name,
      email: melhor.email ?? undefined,
      cep: melhor.zip_code ?? undefined,
      endereco: melhor.address ?? undefined,
      numero: melhor.number ?? undefined,
      complemento: melhor.complement ?? undefined,
      bairro: melhor.district ?? undefined,
      cidade: melhor.city ?? undefined,
      uf: melhor.state ?? undefined,
    },
  };
}

const customerSchema = z.object({
  customerId: uuidLike.optional(),
  companyId: uuidLike,
  type: z.enum(["PF", "PJ"]),
  name: z.string().trim().min(2, "Informe o nome."),
  cpfCnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  email: z.string().trim().optional(),
  zipCode: z.string().trim().optional(),
  address: z.string().trim().optional(),
  number: z.string().trim().optional(),
  complement: z.string().trim().optional(),
  district: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
});

export async function saveCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };
  await requireCompanyMember(companyId);

  const parsed = customerSchema.safeParse({
    customerId: formData.get("customerId") || undefined,
    companyId,
    type: formData.get("type"),
    name: formData.get("name"),
    cpfCnpj: formData.get("cpfCnpj") || undefined,
    email: formData.get("email") || undefined,
    zipCode: formData.get("zipCode") || undefined,
    address: formData.get("address") || undefined,
    number: formData.get("number") || undefined,
    complement: formData.get("complement") || undefined,
    district: formData.get("district") || undefined,
    city: formData.get("city") || undefined,
    state: formData.get("state") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { customerId, ...rest } = parsed.data;

  const supabase = await createClient();
  const payload = {
    company_id: rest.companyId,
    type: rest.type,
    name: rest.name,
    cpf_cnpj: rest.cpfCnpj || null,
    email: rest.email || null,
    zip_code: rest.zipCode || null,
    address: rest.address || null,
    number: rest.number || null,
    complement: rest.complement || null,
    district: rest.district || null,
    city: rest.city || null,
    state: rest.state || null,
  };

  const { error } = customerId
    ? await supabase.from("customers").update(payload).eq("id", customerId)
    : await supabase.from("customers").insert(payload);

  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Já existe um tomador com esse CPF/CNPJ."
          : "Não foi possível salvar o tomador.",
    };
  }

  // Reaproveitado pelo módulo de emissão da equipe (/admin/emissao-notas) —
  // sem redirectTo explícito, cai no comportamento original (portal do
  // cliente). Só aceita caminho relativo interno, nunca uma URL externa.
  const redirectToRaw = formData.get("redirectTo");
  const redirectTo =
    typeof redirectToRaw === "string" && redirectToRaw.startsWith("/")
      ? redirectToRaw
      : `/empresas/${rest.companyId}/tomadores`;

  revalidatePath(redirectTo);
  redirect(redirectTo);
}

export type ImportTomadoresState =
  | {
      error?: string;
      resultado?: {
        importados: number;
        ignorados: number;
        erros: { arquivo: string; motivo: string }[];
      };
    }
  | undefined;

export async function importarTomadoresXml(
  _prevState: ImportTomadoresState,
  formData: FormData,
): Promise<ImportTomadoresState> {
  const companyId = formData.get("companyId");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };
  await requireCompanyMember(companyId);

  const arquivos = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (arquivos.length === 0) {
    return { error: "Selecione um ou mais arquivos XML." };
  }

  const supabase = await createClient();
  const erros: { arquivo: string; motivo: string }[] = [];
  const vistosNesseLote = new Set<string>();
  let importados = 0;
  let ignorados = 0;

  for (const arquivo of arquivos) {
    let texto: string;
    try {
      texto = await arquivo.text();
    } catch {
      erros.push({ arquivo: arquivo.name, motivo: "Não foi possível ler o arquivo." });
      continue;
    }

    const tomador = extrairTomadorDeXml(texto);
    if (!tomador) {
      erros.push({
        arquivo: arquivo.name,
        motivo: "Não achei os dados do tomador (CPF/CNPJ e nome) nesse XML.",
      });
      continue;
    }

    if (vistosNesseLote.has(tomador.cpfCnpj)) {
      ignorados += 1;
      continue;
    }
    vistosNesseLote.add(tomador.cpfCnpj);

    const { error } = await supabase.from("customers").insert({
      company_id: companyId,
      type: tomador.tipo,
      cpf_cnpj: tomador.cpfCnpj,
      name: tomador.nome,
      email: tomador.email || null,
      zip_code: tomador.zipCode || null,
      address: tomador.address || null,
      number: tomador.number || null,
      complement: tomador.complement || null,
      district: tomador.district || null,
    });

    if (error) {
      if (error.code === "23505") {
        ignorados += 1;
      } else {
        erros.push({ arquivo: arquivo.name, motivo: "Não foi possível salvar esse tomador." });
      }
      continue;
    }
    importados += 1;
  }

  if (importados > 0) {
    await logAudit({
      companyId,
      action: "CREATE",
      entity: "customer_import",
      newValue: { importados, ignorados, arquivos: arquivos.length },
    });
  }

  revalidatePath(`/empresas/${companyId}/tomadores`);
  return { resultado: { importados, ignorados, erros } };
}
