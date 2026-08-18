export type UserRole = "SUPER_ADMIN" | "ADMIN_SOMA" | "ADMIN_CLIENTE" | "EMISSOR";

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN_SOMA: "Administrador SOMA",
  ADMIN_CLIENTE: "Administrador Cliente",
  EMISSOR: "Emissor",
};

export type Company = {
  id: string;
  organization_id: string;
  cnpj: string | null;
  legal_name: string;
  trade_name: string | null;
  created_at: string;
};

export type Organization = {
  id: string;
  name: string;
  created_at: string;
};

export type CompanyAccess = {
  company_id: string;
  role: UserRole;
  company: Company;
};

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};
