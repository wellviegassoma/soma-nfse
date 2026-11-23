import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { IBGE_PETROPOLIS, type MotivoDispensa } from "@/lib/sei-labels";

// Cobertura do SEI: todo cliente ativo de Petrópolis deve ter processo no SEI
// (não arquivado) ou uma dispensa conferida — manual (sei_cobertura_dispensas)
// ou "Vigilância Sanitária não se aplica" já marcado em Alvarás e licenças
// (legalizacao_tipos_empresas_excecao com aplicavel=false).

export type SituacaoCobertura = "COM_PROCESSO" | "SEM_PROCESSO" | "DISPENSADO" | "DISPENSADO_LEGALIZACAO";

export type LinhaCobertura = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  codigo_cliente: string | null;
  person_type: string | null;
  cnae: string | null;
  situacao: SituacaoCobertura;
  processos: number;
  dispensa: { motivo: MotivoDispensa; observacao: string | null; created_at: string; por: string | null } | null;
  licencaVisaVencimento: string | null;
};

export async function coberturaPetropolis(supabase: SupabaseClient): Promise<LinhaCobertura[]> {
  const [empresas, processos, { data: dispensas, error: e1 }, { data: tipos, error: e2 }] = await Promise.all([
    buscarTudoPaginado((from, to) =>
      supabase
        .from("companies")
        .select("id, legal_name, trade_name, codigo_cliente, person_type, cnae")
        .eq("ativa", true)
        .or(`municipality_ibge_code.eq.${IBGE_PETROPOLIS},municipality_name.ilike.petr_polis`)
        .order("legal_name")
        .order("id")
        .range(from, to),
    ),
    buscarTudoPaginado((from, to) =>
      supabase
        .from("sei_processos")
        .select("company_id")
        .not("company_id", "is", null)
        .is("arquivado_em", null)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("sei_cobertura_dispensas")
      .select("company_id, motivo, observacao, created_at, autor:profiles!sei_cobertura_dispensas_criado_por_fkey(full_name)")
      .limit(5000),
    supabase.from("legalizacao_tipos_documento").select("id, nome").ilike("nome", "vigil%sanit%"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  const tiposVisa = (tipos ?? []).map((t) => t.id as string);
  const [{ data: naoAplica, error: e3 }, { data: licencas, error: e4 }] = tiposVisa.length
    ? await Promise.all([
        // Só a marcação explícita "não se aplica" (aplicavel=false) conta como
        // dispensa: é uma decisão de alguém, não o padrão do tipo.
        supabase
          .from("legalizacao_tipos_empresas_excecao")
          .select("company_id")
          .in("tipo_id", tiposVisa)
          .eq("aplicavel", false)
          .limit(5000),
        supabase.from("legalizacao_documentos").select("company_id, data_vencimento").in("tipo_id", tiposVisa).limit(5000),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (e3) throw e3;
  if (e4) throw e4;

  const qtdProcessos = new Map<string, number>();
  for (const p of processos as { company_id: string }[]) qtdProcessos.set(p.company_id, (qtdProcessos.get(p.company_id) ?? 0) + 1);
  const dispensaPor = new Map((dispensas ?? []).map((d) => [d.company_id as string, d]));
  const visaNaoAplica = new Set((naoAplica ?? []).map((n) => n.company_id as string));
  const licencaPor = new Map((licencas ?? []).map((l) => [l.company_id as string, l.data_vencimento as string]));

  return (empresas as Omit<LinhaCobertura, "situacao" | "processos" | "dispensa" | "licencaVisaVencimento">[]).map((e) => {
    const n = qtdProcessos.get(e.id) ?? 0;
    const d = dispensaPor.get(e.id);
    const situacao: SituacaoCobertura = n
      ? "COM_PROCESSO"
      : d
        ? "DISPENSADO"
        : visaNaoAplica.has(e.id)
          ? "DISPENSADO_LEGALIZACAO"
          : "SEM_PROCESSO";
    return {
      ...e,
      situacao,
      processos: n,
      dispensa: d
        ? {
            motivo: d.motivo as MotivoDispensa,
            observacao: d.observacao as string | null,
            created_at: d.created_at as string,
            por: (d.autor as unknown as { full_name: string } | null)?.full_name ?? null,
          }
        : null,
      licencaVisaVencimento: licencaPor.get(e.id) ?? null,
    };
  });
}
