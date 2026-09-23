import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CompanyAccess } from "@/lib/types";
import type { Permissao } from "@/lib/permissoes/catalogo";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

type MapaPermissoes = {
  global: Set<Permissao>;
  porEmpresa: Map<string, Set<Permissao>>;
};

// cache() do React deduplica dentro da mesma requisição — antes cada chamada
// a isSomaStaff/requireFinanceiroAccess/etc. disparava sua própria query.
const getMapaPermissoes = cache(async (): Promise<MapaPermissoes> => {
  const mapa: MapaPermissoes = { global: new Set(), porEmpresa: new Map() };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return mapa;

  const { data, error } = await supabase.rpc("minhas_permissoes");
  if (error) throw error;

  for (const row of (data ?? []) as { permissao: string; company_id: string | null }[]) {
    const permissao = row.permissao as Permissao;
    if (!row.company_id) {
      mapa.global.add(permissao);
      continue;
    }
    if (!mapa.porEmpresa.has(row.company_id)) mapa.porEmpresa.set(row.company_id, new Set());
    mapa.porEmpresa.get(row.company_id)!.add(permissao);
  }
  return mapa;
});

/** Permissão global sempre vale; permissão por empresa só vale se companyId bater — espelha public.tem_permissao(). */
export async function temPermissao(permissao: Permissao, companyId?: string): Promise<boolean> {
  const mapa = await getMapaPermissoes();
  if (mapa.global.has(permissao)) return true;
  if (!companyId) return false;
  return mapa.porEmpresa.get(companyId)?.has(permissao) ?? false;
}

/** Uso em Server Components/actions (páginas, layouts) — redireciona pra "/" sem a permissão. */
export async function requirePermissao(permissao: Permissao, companyId?: string) {
  await requireUser();
  if (!(await temPermissao(permissao, companyId))) redirect("/");
}

/** Uso em route.ts — responde 401/403 em vez de redirecionar. Retorna null quando autorizado. */
export async function autorizarApi(
  permissao: Permissao,
  companyId?: string,
): Promise<NextResponse | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  if (!(await temPermissao(permissao, companyId))) {
    return NextResponse.json({ error: "Sem permissão para essa ação." }, { status: 403 });
  }
  return null;
}

export async function getUserCompanies(): Promise<CompanyAccess[]> {
  const user = await requireUser();
  const supabase = await createClient();
  // RLS por si só não basta aqui: ela deixa SOMA staff ler QUALQUER linha de
  // usuario_permissoes (necessário para as telas de admin), então sem esse
  // filtro explícito por user_id essa função devolveria os vínculos de
  // outras pessoas também. O mesmo vale para shares_company_with — um
  // colega da mesma empresa também passaria pela RLS sem esse filtro.
  const { data, error } = await supabase
    .from("usuario_permissoes")
    .select(
      "permissao, company_id, company:companies(id, organization_id, person_type, cnpj, cpf, legal_name, trade_name, created_at)",
    )
    .eq("user_id", user.id)
    .not("company_id", "is", null)
    .order("created_at", { referencedTable: "companies", ascending: true });

  if (error) throw error;

  const porEmpresa = new Map<string, CompanyAccess>();
  for (const row of (data ?? []) as unknown as {
    permissao: Permissao;
    company_id: string;
    company: CompanyAccess["company"];
  }[]) {
    if (!row.company_id || !row.company) continue;
    let access = porEmpresa.get(row.company_id);
    if (!access) {
      access = { company_id: row.company_id, permissoes: [], company: row.company };
      porEmpresa.set(row.company_id, access);
    }
    access.permissoes.push(row.permissao);
  }
  return [...porEmpresa.values()];
}

export async function isSomaStaff() {
  return temPermissao("empresas.ver");
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
  return temPermissao("configuracoes.editar");
}

export async function requireSuperAdmin() {
  await requireUser();
  if (!(await isSuperAdmin())) redirect("/");
}

// Cada módulo novo (Legalização, Extratos) é restrito a quem tem a
// permissão específica do módulo — diferente de requireSomaStaff(), que dá
// acesso a tudo em /admin. Staff completo (empresas.ver) também passa,
// porque o backfill deu legalizacao.ver/extratos.ver globalmente pra
// SUPER_ADMIN e ADMIN_SOMA.
export async function requireLegalizacaoAccess() {
  await requirePermissao("legalizacao.ver");
}

export async function requireExtratosAccess() {
  await requirePermissao("extratos.ver");
}

// Atendimento é o inbox de WhatsApp da própria SOMA — cliente nunca vê,
// mesmo padrão de requireLegalizacaoAccess/requireExtratosAccess.
export async function requireAtendimentoAccess() {
  await requirePermissao("atendimento.atender");
}

// Financeiro é o único módulo que staff e cliente usam sobre o MESMO dado
// sensível (saldo, fornecedor, folha). temPermissao já cobre os dois casos
// num só teste: staff/analista têm financeiro.ver GLOBAL (companyId é
// ignorado), cliente tem financeiro.ver ESCOPADO só à própria empresa.
export async function requireFinanceiroAccess(companyId?: string) {
  await requirePermissao("financeiro.ver", companyId);
}

// Precificação é usada lado a lado por staff e cliente (ambos editam o
// mesmo catálogo).
export async function requirePrecificacaoAccess(companyId: string) {
  await requirePermissao("precificacao.ver", companyId);
}

export async function getCompanyAccess(companyId: string): Promise<CompanyAccess | null> {
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
