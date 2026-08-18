export type UserRole = "SUPER_ADMIN" | "ADMIN_SOMA" | "ADMIN_CLIENTE" | "EMISSOR";

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN_SOMA: "Administrador SOMA",
  ADMIN_CLIENTE: "Administrador Cliente",
  EMISSOR: "Emissor",
};

export type TaxRegime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
};

export type NfseAmbiente = "HOMOLOGACAO" | "PRODUCAO";

export const AMBIENTE_LABELS: Record<NfseAmbiente, string> = {
  HOMOLOGACAO: "Homologação",
  PRODUCAO: "Produção",
};

export type CustomerType = "PF" | "PJ";

export type Company = {
  id: string;
  organization_id: string;
  cnpj: string | null;
  legal_name: string;
  trade_name: string | null;
  created_at: string;
  municipal_registration: string | null;
  tax_regime: TaxRegime | null;
  cnae: string | null;
  municipality_ibge_code: string | null;
  nfse_ambiente: NfseAmbiente;
  dps_series: string;
  dps_next_number: number;
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

export type CertificateMeta = {
  id: string;
  company_id: string;
  fingerprint: string;
  expires_at: string;
  created_at: string;
};

export type Service = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  national_tax_code: string | null;
  municipal_tax_code: string | null;
  nbs: string | null;
  iss_rate: number | null;
  taxation_type: string | null;
  active: boolean;
};

export type ServicePublic = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type Customer = {
  id: string;
  company_id: string;
  type: CustomerType;
  cpf_cnpj: string | null;
  name: string;
  email: string | null;
  zip_code: string | null;
  address: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
};
