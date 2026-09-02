import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CompanyAccess } from "@/lib/types";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function getUserCompanies(): Promise<CompanyAccess[]> {
  const user = await requireUser();
  const supabase = await createClient();
  // RLS por si só não basta aqui: ela deixa SOMA staff ler QUALQUER linha de
  // user_companies (necessário para as telas de admin), então sem esse filtro
  // explícito por user_id essa função devolveria os vínculos de outras
  // pessoas também. O mesmo vale para shares_company_with — um colega da
  // mesma empresa também passaria pela RLS sem esse filtro.
  const { data, error } = await supabase
    .from("user_companies")
    .select(
      "company_id, role, company:companies(id, organization_id, person_type, cnpj, cpf, legal_name, trade_name, created_at)",
    )
    .eq("user_id", user.id)
    .order("created_at", { referencedTable: "companies", ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as CompanyAccess[];
}

export async function isSomaStaff() {
  const companies = await getUserCompanies();
  return companies.some(
    (c) => c.role === "SUPER_ADMIN" || c.role === "ADMIN_SOMA",
  );
}

export async function requireSomaStaff() {
  await requireUser();
  if (!(await isSomaStaff())) redirect("/");
}

// Mais restrito que requireSomaStaff() — ADMIN_SOMA não passa aqui. Usado
// pra configurações sensíveis compartilhadas por todo o sistema (ex.:
// dados do contador responsável usados em toda declaração do MIT), onde
// só o dono/sócio (SUPER_ADMIN) deve poder mexer.
export async function isSuperAdmin() {
  const companies = await getUserCompanies();
  return companies.some((c) => c.role === "SUPER_ADMIN");
}

export async function requireSuperAdmin() {
  await requireUser();
  if (!(await isSuperAdmin())) redirect("/");
}

// Cada módulo novo (Legalização, Extratos) é restrito ao próprio papel —
// diferente de requireSomaStaff(), que dá acesso a tudo em /admin. Staff
// completo (SUPER_ADMIN/ADMIN_SOMA) também passa, pra continuar
// enxergando qualquer módulo.
export async function requireLegalizacaoAccess() {
  await requireUser();
  const companies = await getUserCompanies();
  const ok = companies.some(
    (c) =>
      c.role === "SUPER_ADMIN" ||
      c.role === "ADMIN_SOMA" ||
      c.role === "ANALISTA_LEGALIZACAO",
  );
  if (!ok) redirect("/");
}

export async function requireExtratosAccess() {
  await requireUser();
  const companies = await getUserCompanies();
  const ok = companies.some(
    (c) =>
      c.role === "SUPER_ADMIN" ||
      c.role === "ADMIN_SOMA" ||
      c.role === "ANALISTA_CONTABIL",
  );
  if (!ok) redirect("/");
}

// Precificação é usada lado a lado por staff e cliente (ambos editam o
// mesmo catálogo) — diferente de requireLegalizacaoAccess/requireExtratosAccess,
// que restringem a papéis específicos de analista. Aqui basta ter algum
// vínculo com a empresa (qualquer role em user_companies) ou ser staff SOMA.
export async function requirePrecificacaoAccess(companyId: string) {
  await requireUser();
  if (await isSomaStaff()) return;
  const access = await getCompanyAccess(companyId);
  if (!access) redirect("/");
}

export async function getCompanyAccess(
  companyId: string,
): Promise<CompanyAccess | null> {
  const companies = await getUserCompanies();
  return companies.find((c) => c.company_id === companyId) ?? null;
}

export async function getCurrentProfileName(): Promise<string | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  return data?.full_name ?? null;
}
