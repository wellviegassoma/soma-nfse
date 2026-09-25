"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePermissao, requireSuperAdmin, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uuidLike } from "@/lib/zod-helpers";
import { buscarDadosCnpj, type DadosCnpj } from "@/lib/cnpj-lookup";
import { isCpfValido } from "@/lib/formatters";
import { criarEmpresaComOrganizacao } from "@/lib/actions/empresas";
import type { ActionState } from "@/lib/actions/auth";

// Mesma buscarDadosCnpj de lib/cnpj-lookup.ts usada em createCompany — só
// troca o guard (comercial.editar em vez de requireSomaStaff), não mexe em
// buscarCnpjAction.
export async function buscarCnpjParaProspect(
  cnpj: string,
): Promise<{ data: DadosCnpj } | { error: string }> {
  await requirePermissao("comercial.editar");
  const digits = cnpj.replace(/\D/g, "");
  return buscarDadosCnpj(digits);
}

// ---------------------------------------------------------------------------
// Prospects
// ---------------------------------------------------------------------------
const prospectSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome."),
  tipoOnboarding: z.enum(["TRANSICAO_CONTABIL", "ABERTURA_NOVO_CNPJ"]).optional(),
  pessoaTipo: z.enum(["PF", "PJ"]).optional(),
  especialidade: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  origemLead: z.enum(["INSTAGRAM", "AULA", "INDICACAO", "OUTRO"]).optional(),
  indicadoPor: z.string().trim().optional(),
  regimeTributario: z.string().trim().optional(),
  faturamentoMedioEstimado: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  honorarioSoma: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v.replace(",", ".")) : undefined)),
  descricao: z.string().trim().optional(),
});

export async function criarProspect(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("comercial.editar");

  const parsed = prospectSchema.safeParse({
    nome: formData.get("nome"),
    tipoOnboarding: formData.get("tipoOnboarding") || undefined,
    pessoaTipo: formData.get("pessoaTipo") || undefined,
    especialidade: formData.get("especialidade") || undefined,
    cidade: formData.get("cidade") || undefined,
    origemLead: formData.get("origemLead") || undefined,
    indicadoPor: formData.get("indicadoPor") || undefined,
    regimeTributario: formData.get("regimeTributario") || undefined,
    faturamentoMedioEstimado: formData.get("faturamentoMedioEstimado") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    cpf: formData.get("cpf") || undefined,
    honorarioSoma: formData.get("honorarioSoma") || undefined,
    descricao: formData.get("descricao") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const { data: primeiraEtapa } = await supabase
    .from("comercial_etapas")
    .select("id")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!primeiraEtapa) {
    return { error: "Nenhuma etapa cadastrada — configure o funil em Comercial > Etapas antes." };
  }

  const { data: prospect, error } = await supabase
    .from("comercial_prospects")
    .insert({
      nome: parsed.data.nome,
      tipo_onboarding: parsed.data.tipoOnboarding || null,
      pessoa_tipo: parsed.data.pessoaTipo || null,
      especialidade: parsed.data.especialidade || null,
      cidade: parsed.data.cidade || null,
      origem_lead: parsed.data.origemLead || null,
      indicado_por: parsed.data.origemLead === "INDICACAO" ? parsed.data.indicadoPor || null : null,
      regime_tributario: parsed.data.regimeTributario || null,
      faturamento_medio_estimado: parsed.data.faturamentoMedioEstimado ?? null,
      cnpj: parsed.data.cnpj || null,
      cpf: parsed.data.cpf || null,
      honorario_soma: parsed.data.honorarioSoma ?? null,
      descricao: parsed.data.descricao || null,
      etapa_id: primeiraEtapa.id,
      responsavel_id: user.id,
    })
    .select("id")
    .single();
  if (error || !prospect) {
    return { error: "Não foi possível criar o prospect." };
  }

  // Copia o template ativo pro snapshot do prospect — mesmo espírito do
  // "copiar cartão de Template" do Trello. Snapshot em texto, sem FK: editar
  // o template depois nunca altera um prospect já em andamento.
  const [{ data: categorias }, { data: itens }] = await Promise.all([
    supabase.from("comercial_checklist_categorias").select("id, nome, ordem").eq("ativo", true),
    supabase.from("comercial_checklist_itens_template").select("categoria_id, descricao, ordem").eq("ativo", true),
  ]);
  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c]));
  const linhas = (itens ?? [])
    .map((item) => {
      const categoria = categoriaPorId.get(item.categoria_id);
      if (!categoria) return null;
      return {
        prospect_id: prospect.id,
        categoria_nome: categoria.nome,
        categoria_ordem: categoria.ordem,
        item_descricao: item.descricao,
        item_ordem: item.ordem,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  if (linhas.length > 0) {
    await supabase.from("comercial_prospect_checklist").insert(linhas);
  }

  await supabase.from("comercial_prospect_atividade").insert({
    prospect_id: prospect.id,
    tipo: "SISTEMA",
    autor_id: user.id,
    corpo: "Prospect criado.",
  });

  revalidatePath("/admin/comercial");
  redirect(`/admin/comercial/${prospect.id}`);
}

const editarProspectSchema = prospectSchema.extend({ prospectId: uuidLike });

export async function editarProspect(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("comercial.editar");

  const parsed = editarProspectSchema.safeParse({
    prospectId: formData.get("prospectId"),
    nome: formData.get("nome"),
    tipoOnboarding: formData.get("tipoOnboarding") || undefined,
    pessoaTipo: formData.get("pessoaTipo") || undefined,
    especialidade: formData.get("especialidade") || undefined,
    cidade: formData.get("cidade") || undefined,
    origemLead: formData.get("origemLead") || undefined,
    indicadoPor: formData.get("indicadoPor") || undefined,
    regimeTributario: formData.get("regimeTributario") || undefined,
    faturamentoMedioEstimado: formData.get("faturamentoMedioEstimado") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    cpf: formData.get("cpf") || undefined,
    honorarioSoma: formData.get("honorarioSoma") || undefined,
    descricao: formData.get("descricao") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { prospectId, ...rest } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("comercial_prospects")
    .update({
      nome: rest.nome,
      tipo_onboarding: rest.tipoOnboarding || null,
      pessoa_tipo: rest.pessoaTipo || null,
      especialidade: rest.especialidade || null,
      cidade: rest.cidade || null,
      origem_lead: rest.origemLead || null,
      indicado_por: rest.origemLead === "INDICACAO" ? rest.indicadoPor || null : null,
      regime_tributario: rest.regimeTributario || null,
      faturamento_medio_estimado: rest.faturamentoMedioEstimado ?? null,
      cnpj: rest.cnpj || null,
      cpf: rest.cpf || null,
      honorario_soma: rest.honorarioSoma ?? null,
      descricao: rest.descricao || null,
    })
    .eq("id", prospectId);
  if (error) return { error: "Não foi possível salvar." };

  revalidatePath(`/admin/comercial/${prospectId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Mover de etapa — etapas TERMINAL_GANHO não passam por aqui (a UI manda pra
// /admin/comercial/[prospectId]/confirmar-cliente em vez de chamar isso).
// ---------------------------------------------------------------------------
export async function moverProspectEtapa(prospectId: string, etapaId: string) {
  await requirePermissao("comercial.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: etapaDestino } = await supabase
    .from("comercial_etapas")
    .select("id, nome, tipo")
    .eq("id", etapaId)
    .single();
  if (!etapaDestino) throw new Error("Etapa não encontrada.");
  if (etapaDestino.tipo === "TERMINAL_GANHO") {
    throw new Error("Pra mover pra essa etapa, use a tela de confirmação.");
  }

  const { data: prospectAtual } = await supabase
    .from("comercial_prospects")
    .select("etapa_id")
    .eq("id", prospectId)
    .single();
  if (!prospectAtual) throw new Error("Prospect não encontrado.");

  const { error } = await supabase
    .from("comercial_prospects")
    .update({ etapa_id: etapaId })
    .eq("id", prospectId);
  if (error) throw new Error("Não foi possível mover o prospect.");

  await supabase.from("comercial_prospect_historico").insert({
    prospect_id: prospectId,
    de_etapa_id: prospectAtual.etapa_id,
    para_etapa_id: etapaId,
    user_id: user.id,
  });
  await supabase.from("comercial_prospect_atividade").insert({
    prospect_id: prospectId,
    tipo: "MUDANCA_ETAPA",
    autor_id: user.id,
    corpo: `Moveu para "${etapaDestino.nome}".`,
  });

  revalidatePath("/admin/comercial");
  revalidatePath(`/admin/comercial/${prospectId}`);
}

export async function marcarChecklistItem(itemId: string, prospectId: string, concluido: boolean) {
  await requirePermissao("comercial.editar");
  const user = await requireUser();
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("comercial_prospect_checklist")
    .select("item_descricao")
    .eq("id", itemId)
    .single();

  const { error } = await supabase
    .from("comercial_prospect_checklist")
    .update({
      concluido,
      concluido_por: concluido ? user.id : null,
      concluido_em: concluido ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  if (error) throw new Error("Não foi possível atualizar o item.");

  if (item) {
    await supabase.from("comercial_prospect_atividade").insert({
      prospect_id: prospectId,
      tipo: "CHECKLIST_ITEM",
      autor_id: user.id,
      corpo: `${concluido ? "Marcou" : "Desmarcou"} "${item.item_descricao}".`,
    });
  }

  revalidatePath(`/admin/comercial/${prospectId}`);
}

const comentarioSchema = z.object({
  prospectId: uuidLike,
  corpo: z.string().trim().min(1, "Escreva um comentário."),
});

export async function adicionarComentario(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("comercial.editar");
  const parsed = comentarioSchema.safeParse({
    prospectId: formData.get("prospectId"),
    corpo: formData.get("corpo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("comercial_prospect_atividade").insert({
    prospect_id: parsed.data.prospectId,
    tipo: "COMENTARIO",
    autor_id: user.id,
    corpo: parsed.data.corpo,
  });
  if (error) return { error: "Não foi possível salvar o comentário." };

  revalidatePath(`/admin/comercial/${parsed.data.prospectId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Anexos — mesmo padrão de duas peças do Blob usado em Legalização (ver
// /api/comercial/upload). Lista insert-only, não upsert-um-por-tipo.
// ---------------------------------------------------------------------------
const salvarAnexoSchema = z.object({
  prospectId: uuidLike,
  blobUrl: z.string().url(),
  blobPathname: z.string().min(1),
  nomeArquivo: z.string().min(1),
});

export async function salvarAnexoComercial(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("comercial.editar");
  const parsed = salvarAnexoSchema.safeParse({
    prospectId: formData.get("prospectId"),
    blobUrl: formData.get("blobUrl"),
    blobPathname: formData.get("blobPathname"),
    nomeArquivo: formData.get("nomeArquivo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("comercial_prospect_anexos").insert({
    prospect_id: parsed.data.prospectId,
    blob_url: parsed.data.blobUrl,
    blob_pathname: parsed.data.blobPathname,
    nome_arquivo: parsed.data.nomeArquivo,
    uploaded_by: user.id,
  });
  if (error) return { error: "Não foi possível salvar o anexo." };

  revalidatePath(`/admin/comercial/${parsed.data.prospectId}`);
  return { success: true };
}

export async function apagarAnexoComercial(anexoId: string, prospectId: string) {
  await requirePermissao("comercial.editar");
  const supabase = await createClient();

  const { data: anexo } = await supabase
    .from("comercial_prospect_anexos")
    .select("blob_pathname")
    .eq("id", anexoId)
    .single();
  if (!anexo) return;

  const { error } = await supabase.from("comercial_prospect_anexos").delete().eq("id", anexoId);
  if (error) throw new Error("Não foi possível remover o anexo.");

  await del(anexo.blob_pathname).catch(() => {});
  revalidatePath(`/admin/comercial/${prospectId}`);
}

// ---------------------------------------------------------------------------
// Arquivar / excluir — arquivar é reversível (some do quadro, mantém
// checklist/histórico/atividade); excluir é permanente (cascata apaga tudo).
// ---------------------------------------------------------------------------
export async function arquivarProspect(prospectId: string) {
  await requirePermissao("comercial.editar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("comercial_prospects")
    .update({ arquivado_em: new Date().toISOString() })
    .eq("id", prospectId);
  if (error) throw new Error("Não foi possível arquivar o prospect.");
  revalidatePath("/admin/comercial");
  revalidatePath("/admin/comercial/arquivados");
  revalidatePath(`/admin/comercial/${prospectId}`);
}

export async function desarquivarProspect(prospectId: string) {
  await requirePermissao("comercial.editar");
  const supabase = await createClient();
  const { error } = await supabase
    .from("comercial_prospects")
    .update({ arquivado_em: null })
    .eq("id", prospectId);
  if (error) throw new Error("Não foi possível desarquivar o prospect.");
  revalidatePath("/admin/comercial");
  revalidatePath("/admin/comercial/arquivados");
  revalidatePath(`/admin/comercial/${prospectId}`);
}

export async function excluirProspectPermanente(prospectId: string) {
  await requirePermissao("comercial.editar");
  const supabase = await createClient();
  const { error } = await supabase.from("comercial_prospects").delete().eq("id", prospectId);
  if (error) throw new Error("Não foi possível excluir o prospect.");
  revalidatePath("/admin/comercial");
  revalidatePath("/admin/comercial/arquivados");
  redirect("/admin/comercial");
}

// ---------------------------------------------------------------------------
// Confirmação de virada pra Cliente Ativo — cria a empresa de verdade (ver
// criarEmpresaComOrganizacao) e só então move o prospect pra etapa
// TERMINAL_GANHO.
// ---------------------------------------------------------------------------
const confirmarClienteSchema = z.object({
  prospectId: uuidLike,
  organizationName: z.string().trim().min(2, "Informe o nome da empresa/organização."),
  legalName: z.string().trim().min(2, "Informe a razão social."),
  tradeName: z.string().trim().optional(),
  personType: z.enum(["PF", "PJ"]).default("PJ"),
  cnpj: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined)),
  cpf: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\D/g, "") : undefined))
    .refine((v) => v === undefined || isCpfValido(v), "CPF inválido."),
  cnae: z.string().trim().optional(),
  municipalityIbgeCode: z.string().trim().optional(),
  municipalityName: z.string().trim().optional(),
  state: z.string().trim().optional(),
  addressStreet: z.string().trim().optional(),
  addressNumber: z.string().trim().optional(),
  addressComplement: z.string().trim().optional(),
  addressNeighborhood: z.string().trim().optional(),
  addressZip: z.string().trim().optional(),
  taxRegime: z
    .enum(["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "IMUNE_ISENTO"])
    .optional()
    .or(z.literal("")),
});

export async function confirmarClienteAtivo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermissao("comercial.editar");

  const parsed = confirmarClienteSchema.safeParse({
    prospectId: formData.get("prospectId"),
    organizationName: formData.get("organizationName"),
    legalName: formData.get("legalName"),
    tradeName: formData.get("tradeName") || undefined,
    personType: formData.get("personType") || undefined,
    cnpj: formData.get("cnpj") || undefined,
    cpf: formData.get("cpf") || undefined,
    cnae: formData.get("cnae") || undefined,
    municipalityIbgeCode: formData.get("municipalityIbgeCode") || undefined,
    municipalityName: formData.get("municipalityName") || undefined,
    state: formData.get("state") || undefined,
    addressStreet: formData.get("addressStreet") || undefined,
    addressNumber: formData.get("addressNumber") || undefined,
    addressComplement: formData.get("addressComplement") || undefined,
    addressNeighborhood: formData.get("addressNeighborhood") || undefined,
    addressZip: formData.get("addressZip") || undefined,
    taxRegime: formData.get("taxRegime") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  if (parsed.data.personType === "PF" && !parsed.data.cpf) {
    return { error: "Informe o CPF." };
  }
  const { prospectId, ...dadosEmpresa } = parsed.data;

  const user = await requireUser();
  const supabase = await createClient();

  const { data: prospect } = await supabase
    .from("comercial_prospects")
    .select("id, etapa_id, company_id")
    .eq("id", prospectId)
    .single();
  if (!prospect) return { error: "Prospect não encontrado." };

  const { data: etapaGanho } = await supabase
    .from("comercial_etapas")
    .select("id, nome")
    .eq("tipo", "TERMINAL_GANHO")
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!etapaGanho) {
    return { error: "Nenhuma etapa do tipo Cliente Ativo configurada em Comercial > Etapas." };
  }

  // Re-confirmação acidental: se já tem empresa, só troca a etapa (nunca
  // recria).
  let companyId = prospect.company_id;
  if (!companyId) {
    const resultado = await criarEmpresaComOrganizacao(dadosEmpresa);
    if ("error" in resultado) return { error: resultado.error };
    companyId = resultado.companyId;
  }

  const { error } = await supabase
    .from("comercial_prospects")
    .update({ company_id: companyId, etapa_id: etapaGanho.id })
    .eq("id", prospectId);
  if (error) return { error: "Não foi possível confirmar a virada pra cliente ativo." };

  await supabase.from("comercial_prospect_historico").insert({
    prospect_id: prospectId,
    de_etapa_id: prospect.etapa_id,
    para_etapa_id: etapaGanho.id,
    user_id: user.id,
  });
  await supabase.from("comercial_prospect_atividade").insert({
    prospect_id: prospectId,
    tipo: "SISTEMA",
    autor_id: user.id,
    corpo: `Empresa criada automaticamente: ${dadosEmpresa.legalName}.`,
  });

  await logAudit({
    companyId,
    action: "CREATE",
    entity: "comercial_cliente_ativo",
    entityId: prospectId,
    newValue: { prospect_id: prospectId, legal_name: dadosEmpresa.legalName },
  });

  revalidatePath("/admin/comercial");
  revalidatePath(`/admin/comercial/${prospectId}`);
  revalidatePath("/admin/empresas");
  redirect(`/admin/empresas/${companyId}`);
}

// ---------------------------------------------------------------------------
// Configuração do funil (Super Admin) — colunas do Kanban.
// ---------------------------------------------------------------------------
const etapaSchema = z.object({
  etapaId: uuidLike.optional(),
  nome: z.string().trim().min(2, "Informe o nome."),
  ordem: z.coerce.number().int(),
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida — use o formato #RRGGBB."),
  tipo: z.enum(["PIPELINE", "TERMINAL_GANHO", "TERMINAL_PERDIDO", "PARKING"]),
});

export async function salvarEtapa(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();

  const parsed = etapaSchema.safeParse({
    etapaId: formData.get("etapaId") || undefined,
    nome: formData.get("nome"),
    ordem: formData.get("ordem"),
    cor: formData.get("cor"),
    tipo: formData.get("tipo"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { etapaId, ...payload } = parsed.data;

  const supabase = await createClient();
  const { error } = etapaId
    ? await supabase.from("comercial_etapas").update(payload).eq("id", etapaId)
    : await supabase.from("comercial_etapas").insert(payload);
  if (error) {
    return {
      error: error.code === "23505" ? "Já existe uma etapa com esse nome." : "Não foi possível salvar a etapa.",
    };
  }

  revalidatePath("/admin/comercial/etapas");
  revalidatePath("/admin/comercial");
  return { success: true };
}

export async function alternarAtivoEtapa(etapaId: string, ativo: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("comercial_etapas").update({ ativo }).eq("id", etapaId);
  if (error) throw new Error("Não foi possível atualizar a etapa.");
  revalidatePath("/admin/comercial/etapas");
  revalidatePath("/admin/comercial");
}

// ---------------------------------------------------------------------------
// Template do checklist (Super Admin).
// ---------------------------------------------------------------------------
const categoriaSchema = z.object({
  categoriaId: uuidLike.optional(),
  nome: z.string().trim().min(2, "Informe o nome."),
  ordem: z.coerce.number().int(),
});

export async function salvarChecklistCategoria(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = categoriaSchema.safeParse({
    categoriaId: formData.get("categoriaId") || undefined,
    nome: formData.get("nome"),
    ordem: formData.get("ordem"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { categoriaId, ...payload } = parsed.data;

  const supabase = await createClient();
  const { error } = categoriaId
    ? await supabase.from("comercial_checklist_categorias").update(payload).eq("id", categoriaId)
    : await supabase.from("comercial_checklist_categorias").insert(payload);
  if (error) {
    return {
      error: error.code === "23505" ? "Já existe uma categoria com esse nome." : "Não foi possível salvar.",
    };
  }

  revalidatePath("/admin/comercial/checklist-template");
  return { success: true };
}

export async function alternarAtivoChecklistCategoria(categoriaId: string, ativo: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("comercial_checklist_categorias")
    .update({ ativo })
    .eq("id", categoriaId);
  if (error) throw new Error("Não foi possível atualizar a categoria.");
  revalidatePath("/admin/comercial/checklist-template");
}

const itemSchema = z.object({
  itemId: uuidLike.optional(),
  categoriaId: uuidLike,
  descricao: z.string().trim().min(2, "Informe a descrição."),
  ordem: z.coerce.number().int(),
});

export async function salvarChecklistItem(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = itemSchema.safeParse({
    itemId: formData.get("itemId") || undefined,
    categoriaId: formData.get("categoriaId"),
    descricao: formData.get("descricao"),
    ordem: formData.get("ordem"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { itemId, categoriaId, ...rest } = parsed.data;

  const supabase = await createClient();
  const { error } = itemId
    ? await supabase
        .from("comercial_checklist_itens_template")
        .update({ categoria_id: categoriaId, ...rest })
        .eq("id", itemId)
    : await supabase
        .from("comercial_checklist_itens_template")
        .insert({ categoria_id: categoriaId, ...rest });
  if (error) return { error: "Não foi possível salvar o item." };

  revalidatePath("/admin/comercial/checklist-template");
  return { success: true };
}

export async function alternarAtivoChecklistItem(itemId: string, ativo: boolean) {
  await requireSuperAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("comercial_checklist_itens_template")
    .update({ ativo })
    .eq("id", itemId);
  if (error) throw new Error("Não foi possível atualizar o item.");
  revalidatePath("/admin/comercial/checklist-template");
}
