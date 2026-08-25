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

// regEspTrib — domínio do layout NFS-e Nacional.
export const REGIME_ESPECIAL_LABELS: Record<number, string> = {
  0: "Nenhum",
  1: "Ato Cooperado (Cooperativa)",
  2: "Estimativa",
  3: "Microempresa Municipal",
  4: "Notário ou Registrador",
  5: "Profissional Autônomo",
  6: "Sociedade de Profissionais",
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
  regime_especial_tributacao: number;
  allow_retroactive_emission: boolean;
  sujeito_fator_r: boolean;
  fator_r_percentual: number | null;
  rbt12_manual: number | null;
  irpj_csll_apuracao_mensal: boolean;
  iss_aliquota_padrao: number | null;
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
  percentual_total_tributos_federal: number | null;
  percentual_total_tributos_estadual: number | null;
  percentual_total_tributos_municipal: number | null;
  cst_pis_cofins: string | null;
  aliquota_pis: number | null;
  aliquota_cofins: number | null;
  retencao_pis_cofins_csll_aliquota: number | null;
  retencao_irrf_aliquota: number | null;
  tipo_retencao_issqn: number;
  active: boolean;
};

// tpRetISSQN — domínio do layout NFS-e Nacional.
export const RETENCAO_ISSQN_LABELS: Record<number, string> = {
  1: "Não retido (prestador recolhe)",
  2: "Retido pelo tomador",
  3: "Retido pelo intermediário",
};

export type ServicePublic = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

export type DpsStatus = "ACCEPTED" | "REJECTED";

export type DpsListItem = {
  id: string;
  numero_dps: number;
  serie: string;
  valor: number;
  data_competencia: string;
  status: DpsStatus;
  created_at: string;
  customer: { name: string } | null;
  service: { name: string } | null;
  nfse:
    | { access_key: string | null; status: string }
    | { access_key: string | null; status: string }[]
    | null;
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
