import "server-only";
import { createClient } from "@/lib/supabase/server";
import { tipoAplicavel } from "@/app/legalizacao/status";
import { hojeSaoPaulo } from "@/app/legalizacao/processos/status";
import {
  ANTECEDENCIA_PADRAO_DIAS,
  regraAplicavel,
  situacaoLicenca,
  type RegraVencimento,
  type Situacao,
} from "@/lib/legalizacao-licencas";

// Linhas do painel "Alvarás e licenças": uma por empresa ativa × tipo de
// licença aplicável a ela — com a licença vigente, ou "pendente de
// cadastro" quando ainda não há documento. Usado pela página e pela
// exportação CSV, com os mesmos filtros.

export type LinhaLicenca = {
  companyId: string;
  codigoCliente: string | null;
  empresa: string;
  documento: string | null; // CNPJ ou CPF, só dígitos
  municipio: string | null;
  municipioIbge: string | null;
  tipoId: string;
  tipo: string;
  documentoId: string | null;
  numero: string | null;
  orgao: string | null;
  dataEmissao: string | null;
  dataVencimento: string | null;
  situacao: Situacao;
  dias: number | null;
  antecedencia: number;
};

// Lista (e não objeto) porque chaves numéricas ("30") seriam reordenadas
// pro começo pelo JavaScript.
export const FILTROS = [
  ["todas", "Todas"],
  ["vencidas", "Vencidas"],
  ["30", "Vencem em 30 dias"],
  ["60", "Em 60 dias"],
  ["90", "Em 90 dias"],
  ["sem_vencimento", "Sem vencimento"],
  ["pendentes", "Pendentes de cadastro"],
] as const;
export type Filtro = (typeof FILTROS)[number][0];

export type ParametrosPainel = {
  f: Filtro;
  q: string;
  tipo: string;
  municipio: string;
  de: string;
  ate: string;
};

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function lerParametros(sp: Record<string, string | string[] | undefined>): ParametrosPainel {
  const f = texto(sp.f);
  const data = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  return {
    f: (FILTROS.some(([k]) => k === f) ? f : "todas") as Filtro,
    q: texto(sp.q),
    tipo: texto(sp.tipo),
    municipio: texto(sp.municipio),
    de: data(texto(sp.de)),
    ate: data(texto(sp.ate)),
  };
}

type Empresa = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  cnpj: string | null;
  cpf: string | null;
  municipality_name: string | null;
  municipality_ibge_code: string | null;
  state: string | null;
  legalizacao_documentos:
    | {
        id: string;
        tipo_id: string;
        numero: string | null;
        orgao: string | null;
        data_emissao: string | null;
        data_vencimento: string | null;
      }[]
    | null;
};

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export async function carregarPainelLicencas(p: ParametrosPainel) {
  const supabase = await createClient();
  const [{ data: empresasData }, { data: tipos }, { data: excecoes }, { data: regras }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trade_name, codigo_cliente, cnpj, cpf, municipality_name, municipality_ibge_code, state, legalizacao_documentos(id, tipo_id, numero, orgao, data_emissao, data_vencimento)",
      )
      .eq("ativa", true)
      .order("legal_name"),
    supabase.from("legalizacao_tipos_documento").select("id, nome, aplica_a_todas").eq("ativo", true).order("nome"),
    supabase.from("legalizacao_tipos_empresas_excecao").select("company_id, tipo_id, aplicavel"),
    supabase.from("legalizacao_regras_vencimento").select("*"),
  ]);

  const empresas = (empresasData ?? []) as unknown as Empresa[];
  const listaRegras = (regras ?? []) as RegraVencimento[];
  const excecao = new Map((excecoes ?? []).map((r) => [`${r.company_id}:${r.tipo_id}`, r.aplicavel]));
  const hoje = hojeSaoPaulo();

  const todas: LinhaLicenca[] = [];
  for (const e of empresas) {
    const docPorTipo = new Map((e.legalizacao_documentos ?? []).map((d) => [d.tipo_id, d]));
    for (const t of tipos ?? []) {
      if (!tipoAplicavel(t.aplica_a_todas, excecao.get(`${e.id}:${t.id}`))) continue;
      const doc = docPorTipo.get(t.id) ?? null;
      const antecedencia =
        regraAplicavel(listaRegras, t.id, e.municipality_ibge_code)?.antecedencia_dias ?? ANTECEDENCIA_PADRAO_DIAS;
      const { situacao, dias } = situacaoLicenca(doc, hoje, antecedencia);
      todas.push({
        companyId: e.id,
        codigoCliente: e.codigo_cliente,
        empresa: e.trade_name || e.legal_name,
        documento: e.cnpj || e.cpf,
        municipio: e.municipality_name ? `${e.municipality_name}${e.state ? `/${e.state}` : ""}` : null,
        municipioIbge: e.municipality_ibge_code,
        tipoId: t.id,
        tipo: t.nome,
        documentoId: doc?.id ?? null,
        numero: doc?.numero ?? null,
        orgao: doc?.orgao ?? null,
        dataEmissao: doc?.data_emissao ?? null,
        dataVencimento: doc?.data_vencimento ?? null,
        situacao,
        dias,
        antecedencia,
      });
    }
  }

  // Filtros de busca (afetam os cards e a tabela).
  const termo = normalizar(p.q);
  const termoDigitos = p.q.replace(/\D/g, "");
  const filtradas = todas.filter((l) => {
    if (p.tipo && l.tipoId !== p.tipo) return false;
    if (p.municipio === "sem" ? l.municipioIbge : p.municipio && l.municipioIbge !== p.municipio) return false;
    if (p.de && (!l.dataVencimento || l.dataVencimento < p.de)) return false;
    if (p.ate && (!l.dataVencimento || l.dataVencimento > p.ate)) return false;
    if (termo) {
      const alvo = normalizar(`${l.empresa} ${l.codigoCliente ?? ""} ${l.tipo} ${l.numero ?? ""} ${l.orgao ?? ""}`);
      const bateDoc = termoDigitos.length >= 3 && (l.documento ?? "").includes(termoDigitos);
      if (!alvo.includes(termo) && !bateDoc) return false;
    }
    return true;
  });

  const contagem: Record<Situacao, number> = { PENDENTE: 0, VENCIDA: 0, A_VENCER: 0, EM_DIA: 0, SEM_VENCIMENTO: 0 };
  for (const l of filtradas) contagem[l.situacao] += 1;

  // Aba (só a tabela).
  const naAba = filtradas.filter((l) => {
    switch (p.f) {
      case "vencidas":
        return l.situacao === "VENCIDA";
      case "30":
      case "60":
      case "90":
        return l.dias != null && l.dias >= 0 && l.dias <= Number(p.f);
      case "sem_vencimento":
        return l.situacao === "SEM_VENCIMENTO";
      case "pendentes":
        return l.situacao === "PENDENTE";
      default:
        return true;
    }
  });

  // Mais urgente primeiro: vencidas (mais atrasada antes), depois por
  // vencimento; sem vencimento e pendentes por último.
  const peso = (l: LinhaLicenca) => (l.dias != null ? l.dias : l.situacao === "PENDENTE" ? 100_000 : 200_000);
  naAba.sort((a, b) => peso(a) - peso(b) || a.empresa.localeCompare(b.empresa) || a.tipo.localeCompare(b.tipo));

  const municipios = new Map<string, { nome: string; total: number }>();
  let empresasSemMunicipio = 0;
  for (const e of empresas) {
    if (!e.municipality_ibge_code) {
      empresasSemMunicipio += 1;
      continue;
    }
    const atual = municipios.get(e.municipality_ibge_code);
    municipios.set(e.municipality_ibge_code, {
      nome: `${e.municipality_name ?? e.municipality_ibge_code}${e.state ? `/${e.state}` : ""}`,
      total: (atual?.total ?? 0) + 1,
    });
  }

  return {
    linhas: naAba,
    totalFiltradas: filtradas.length,
    contagem,
    tipos: (tipos ?? []).map((t) => ({ id: t.id, nome: t.nome })),
    municipios: [...municipios.entries()]
      .map(([ibge, v]) => ({ ibge, ...v }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome)),
    empresasSemMunicipio,
  };
}
