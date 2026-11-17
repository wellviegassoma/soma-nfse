import { Card } from "@/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import type { Service } from "@/lib/types";
import { ServiceForm } from "../ServiceForm";
import { fetchServiceFormContext } from "../suggestions";
import { CopiarDeServico } from "./CopiarDeServico";

export const metadata = { title: "Novo serviço — Painel SOMA" };

// Mesmas colunas da tela de edição — a cópia leva tudo (códigos, alíquotas,
// retenções, IBS/CBS), menos o id.
const COLUNAS =
  "id, company_id, name, description, national_tax_code, municipal_tax_code, nbs, iss_rate, percentual_total_tributos_federal, percentual_total_tributos_estadual, percentual_total_tributos_municipal, cst_pis_cofins, aliquota_pis, aliquota_cofins, retencao_pis_cofins_csll_aliquota, retencao_irrf_aliquota, tipo_retencao_issqn, active, atividade_simples_nacional, ibscbs_cst, ibscbs_cclasstrib, ibscbs_cind_op";

export default async function NewServicePage(
  props: PageProps<"/admin/empresas/[companyId]/servicos/novo">,
) {
  const { companyId } = await props.params;
  const { copiar } = (await props.searchParams) as { copiar?: string };
  const supabase = await createClient();

  const [context, { data: existentes }, origemRes] = await Promise.all([
    fetchServiceFormContext(supabase, companyId),
    supabase.from("services").select("id, name").eq("company_id", companyId).order("name"),
    copiar
      ? supabase.from("services").select(COLUNAS).eq("id", copiar).eq("company_id", companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const origem = origemRes.data as Service | null;
  // Sem id → o formulário salva como serviço NOVO.
  const modelo = origem ? ({ ...origem, id: "", name: `${origem.name} (cópia)`, active: true } as Service) : undefined;

  return (
    <Card className="max-w-2xl p-6 sm:p-8">
      {existentes?.length ? (
        <div className="mb-6 flex flex-col gap-2 rounded-lg border border-border bg-surface-muted/50 p-4">
          <CopiarDeServico companyId={companyId} servicos={existentes.map((s) => ({ id: s.id as string, nome: s.name as string }))} atual={origem?.id ?? ""} />
          {origem ? (
            <p className="text-xs text-foreground/60">
              Copiado de <span className="font-medium text-foreground">{origem.name}</span>. Ajuste o nome e o que mudar, e salve: o
              serviço original não é alterado.
            </p>
          ) : null}
        </div>
      ) : null}
      {/* key: troca de serviço de origem remonta o formulário com os novos valores. */}
      <ServiceForm key={origem?.id ?? "vazio"} companyId={companyId} service={modelo} context={context} />
    </Card>
  );
}
