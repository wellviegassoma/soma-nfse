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
      "company_id, role, company:companies(id, organization_id, cnpj, legal_name, trade_name, created_at)",
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
