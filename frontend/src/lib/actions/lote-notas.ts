"use server";

import { createClient } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/auth";
import { mesCorrenteBrasilia, hojeBrasilia } from "@/lib/competencia";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { lerPlanilhaLote, type LinhaBruta } from "@/lib/lote-notas";
import { calcularRetencoes, lerPercentual, tomadorRetem } from "@/lib/retencoes-nota";
import { carregarPrefillEmissao } from "@/lib/emissao-prefill";

export type LinhaLote = {
  linha: number;
  documento: string;
  nomePlanilha: string;
  customerId?: string;
  tomador?: string;
  serviceId?: string;
  servico?: string;
  amount: string;
  valor: number;
  description: string;
  competenceDate: string;
  issRetido: boolean;
  aliquotaIss: string;
  irrfPct: string;
  csrfPct: string;
  inssPct: string;
  retido: number;
  liquido: number;
  erros: string[];
  avisos: string[];
};

export type ConferenciaLote = { error?: string; linhas?: LinhaLote[] };

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function documentoDe(v: LinhaBruta["documento"]): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return "";
  // Excel transforma CPF/CNPJ em número e come o zero à esquerda.
  if (typeof v === "number") return d.length <= 11 ? d.padStart(11, "0") : d.padStart(14, "0");
  return d;
}

function valorDe(v: LinhaBruta["valor"]): number {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  const s = String(v ?? "").replace(/[R$\s]/g, "");
  if (!s) return NaN;
  // "1.234,56" ou "1234,56" ou "1234.56"
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Math.round(n * 100) / 100;
}

function dataDe(v: LinhaBruta["data"]): string | null {
  if (v == null || v === "") return hojeBrasilia();
  if (v instanceof Date) {
    // Excel grava a data como meia-noite UTC — usa os campos UTC.
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function pctTexto(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v).replace(".", ",").replace("%", "").trim();
}

function simNao(v: unknown): boolean | undefined {
  if (v == null || v === "") return undefined;
  const s = normalizar(String(v));
  if (["s", "sim", "x", "1", "true"].includes(s)) return true;
  if (["n", "nao", "0", "false"].includes(s)) return false;
  return undefined;
}

/**
 * Lê a planilha e devolve a conferência linha a linha — NÃO emite nada.
 * A emissão em si é feita depois, linha por linha, pela mesma action do
 * formulário (issueNfse), só quando a pessoa confirma.
 */
export async function conferirLote(formData: FormData): Promise<ConferenciaLote> {
  const companyId = formData.get("companyId");
  const arquivo = formData.get("arquivo");
  if (typeof companyId !== "string") return { error: "Empresa inválida." };
  if (!(await temPermissao("notas.emitir", companyId))) {
    return { error: "Sem permissão para emitir notas dessa empresa." };
  }
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha a planilha." };
  if (arquivo.size > 3 * 1024 * 1024) return { error: "Arquivo grande demais (máximo 3 MB)." };

  const lida = await lerPlanilhaLote(await arquivo.arrayBuffer());
  if ("error" in lida) return { error: lida.error };

  const supabase = await createClient();
  const [{ data: company }, customers, { data: services }, prefill, recentes] = await Promise.all([
    supabase
      .from("companies")
      .select("tax_regime, iss_aliquota_padrao, allow_retroactive_emission")
      .eq("id", companyId)
      .single(),
    buscarTudoPaginado<{ id: string; name: string; cpf_cnpj: string | null; zip_code: string | null }>(
      (from, to) =>
        supabase.from("customers").select("id, name, cpf_cnpj, zip_code").eq("company_id", companyId).range(from, to),
    ),
    supabase
      .from("services")
      .select(
        "id, name, description, national_tax_code, nbs, percentual_total_tributos_federal, percentual_total_tributos_estadual, percentual_total_tributos_municipal, tipo_retencao_issqn, iss_rate, retencao_irrf_aliquota, retencao_pis_cofins_csll_aliquota",
      )
      .eq("company_id", companyId)
      .eq("active", true),
    carregarPrefillEmissao(supabase, companyId),
    supabase
      .from("dps")
      .select("customer_id, valor, data_competencia")
      .eq("company_id", companyId)
      .eq("status", "ACCEPTED")
      .gte("data_competencia", `${mesCorrenteBrasilia().slice(0, 4)}-01-01`)
      .limit(1000),
  ]);
  if (!company) return { error: "Empresa não encontrada." };

  const porDocumento = new Map(
    customers.filter((c) => c.cpf_cnpj).map((c) => [c.cpf_cnpj!.replace(/\D/g, ""), c]),
  );
  const servicos = services ?? [];
  const servicoPadrao =
    servicos.find((s) => s.id === prefill.servicoMaisUsado) ?? (servicos.length === 1 ? servicos[0] : undefined);
  const jaEmitidas = new Set(
    (recentes.data ?? []).map((d) => `${d.customer_id}|${Number(d.valor).toFixed(2)}|${String(d.data_competencia).slice(0, 7)}`),
  );
  const simples = company.tax_regime === "SIMPLES_NACIONAL";
  const mesCorrente = mesCorrenteBrasilia();
  const vistasNaPlanilha = new Map<string, number>();

  const linhas: LinhaLote[] = lida.linhas.map((b) => {
    const erros: string[] = [];
    const avisos: string[] = [];
    const documento = documentoDe(b.documento);
    const cliente = documento ? porDocumento.get(documento) : undefined;
    if (!documento) erros.push("Falta o CPF/CNPJ do tomador.");
    else if (!cliente) erros.push("Tomador não cadastrado nesta empresa — cadastre antes de emitir.");
    else if (!cliente.zip_code) avisos.push("Tomador sem CEP no cadastro.");
    const nomePlanilha = String(b.nome ?? "");
    if (cliente && nomePlanilha && !normalizar(cliente.name).includes(normalizar(nomePlanilha).split(" ")[0])) {
      avisos.push(`Nome na planilha (“${nomePlanilha}”) diferente do cadastro.`);
    }

    let servico = servicoPadrao;
    if (b.servico != null && String(b.servico).trim()) {
      const alvo = normalizar(String(b.servico));
      servico = servicos.find((s) => normalizar(s.name) === alvo) ?? servicos.find((s) => normalizar(s.name).includes(alvo));
      if (!servico) erros.push(`Serviço “${b.servico}” não encontrado.`);
    }
    if (!servico && !erros.some((e) => e.startsWith("Serviço"))) erros.push("Informe o serviço (a empresa tem mais de um).");
    if (
      servico &&
      (!servico.nbs ||
        servico.percentual_total_tributos_federal == null ||
        servico.percentual_total_tributos_estadual == null ||
        servico.percentual_total_tributos_municipal == null)
    ) {
      erros.push(`Serviço “${servico.name}” está com o cadastro fiscal incompleto.`);
    }

    const valor = valorDe(b.valor);
    if (!Number.isFinite(valor) || valor <= 0) erros.push("Valor inválido.");

    const competenceDate = dataDe(b.data);
    if (!competenceDate) erros.push("Data inválida (use dd/mm/aaaa).");
    else if (!company.allow_retroactive_emission && competenceDate.slice(0, 7) !== mesCorrente) {
      erros.push("Data fora do mês corrente (emissão retroativa desabilitada).");
    }

    const description = String(b.descricao ?? "").trim() || servico?.description || "";
    if (!description) erros.push("Falta a descrição (o serviço não tem descrição padrão).");

    const retem = tomadorRetem(documento);
    const issRetidoPlanilha = simNao(b.issRetido);
    const issRetido = retem && (issRetidoPlanilha ?? (servico?.tipo_retencao_issqn ?? 1) !== 1);
    const aliquotaIss = pctTexto(b.aliquotaIss) || pctTexto(servico?.iss_rate ?? company.iss_aliquota_padrao);
    const irrfPct = retem ? pctTexto(b.irrf) || pctTexto(servico?.retencao_irrf_aliquota) : "";
    const csrfPct = retem ? pctTexto(b.csrf) || pctTexto(servico?.retencao_pis_cofins_csll_aliquota) : "";
    const inssPct = retem ? pctTexto(b.inss) : "";
    if (!retem && (b.irrf || b.csrf || b.inss || issRetidoPlanilha)) {
      avisos.push("Tomador pessoa física: retenções da planilha ignoradas.");
    }
    const pcts = [aliquotaIss, irrfPct, csrfPct, inssPct].map((p) => lerPercentual(p));
    if (pcts.some((p) => p != null && (Number.isNaN(p) || p < 0 || p > 100))) erros.push("Percentual inválido.");
    if (issRetido && simples && !(pcts[0] && pcts[0] > 0)) erros.push("ISS retido no Simples precisa da alíquota do ISS.");

    const r = calcularRetencoes(Number.isFinite(valor) ? valor : 0, {
      issRetido,
      aliquotaIss: Number.isNaN(pcts[0]) ? null : pcts[0],
      irrfPct: Number.isNaN(pcts[1]) ? null : pcts[1],
      csrfPct: Number.isNaN(pcts[2]) ? null : pcts[2],
      inssPct: Number.isNaN(pcts[3]) ? null : pcts[3],
    });

    if (cliente && Number.isFinite(valor) && competenceDate) {
      const chave = `${cliente.id}|${valor.toFixed(2)}|${competenceDate.slice(0, 7)}`;
      if (jaEmitidas.has(chave)) avisos.push("Já existe nota aceita para este tomador com este valor neste mês.");
      const anterior = vistasNaPlanilha.get(chave);
      if (anterior) avisos.push(`Repetida na planilha (igual à linha ${anterior}).`);
      else vistasNaPlanilha.set(chave, b.linha);
    }

    return {
      linha: b.linha,
      documento,
      nomePlanilha,
      customerId: cliente?.id,
      tomador: cliente?.name,
      serviceId: servico?.id,
      servico: servico?.name,
      amount: Number.isFinite(valor) ? String(valor) : "",
      valor: Number.isFinite(valor) ? valor : 0,
      description,
      competenceDate: competenceDate ?? "",
      issRetido,
      aliquotaIss,
      irrfPct,
      csrfPct,
      inssPct,
      retido: r.total,
      liquido: r.liquido,
      erros,
      avisos,
    };
  });

  return { linhas };
}
