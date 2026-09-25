import Link from "next/link";
import { notFound } from "next/navigation";
import { requireComercialAccess, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { EditarProspectForm } from "./EditarProspectForm";
import { ChecklistSection } from "./ChecklistSection";
import { AnexoSection } from "./AnexoSection";
import { AtividadeSection } from "./AtividadeSection";
import { ArquivarExcluirProspect } from "./ArquivarExcluirProspect";
import { MoverEtapaMenu } from "../MoverEtapaMenu";

export const metadata = { title: "Prospect — Comercial" };

export default async function ProspectDetailPage(
  props: PageProps<"/admin/comercial/[prospectId]">,
) {
  const { prospectId } = await props.params;
  await requireComercialAccess();
  const podeEditar = await temPermissao("comercial.editar");

  const supabase = await createClient();
  const [{ data: prospect }, { data: etapas }, { data: checklist }, { data: anexos }, { data: atividades }] =
    await Promise.all([
      supabase
        .from("comercial_prospects")
        .select(
          "id, nome, tipo_onboarding, pessoa_tipo, especialidade, cidade, origem_lead, indicado_por, regime_tributario, faturamento_medio_estimado, cnpj, cpf, honorario_soma, descricao, etapa_id, company_id, arquivado_em, etapa:comercial_etapas(id, nome, cor, tipo)",
        )
        .eq("id", prospectId)
        .maybeSingle(),
      supabase
        .from("comercial_etapas")
        .select("id, nome, tipo")
        .eq("ativo", true)
        .neq("tipo", "TERMINAL_GANHO")
        .order("ordem", { ascending: true }),
      supabase
        .from("comercial_prospect_checklist")
        .select("id, categoria_nome, categoria_ordem, item_descricao, item_ordem, concluido")
        .eq("prospect_id", prospectId)
        .order("categoria_ordem", { ascending: true })
        .order("item_ordem", { ascending: true }),
      supabase
        .from("comercial_prospect_anexos")
        .select("id, blob_url, nome_arquivo, created_at")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("comercial_prospect_atividade")
        .select("id, tipo, corpo, created_at, autor:profiles(full_name)")
        .eq("prospect_id", prospectId)
        .order("created_at", { ascending: false }),
    ]);

  if (!prospect) notFound();
  const etapa = prospect.etapa as unknown as { id: string; nome: string; cor: string; tipo: string } | null;

  return (
    <div className="flex flex-col gap-6">
      {prospect.arquivado_em && (
        <Alert tone="warning">Este prospect está arquivado — não aparece no quadro.</Alert>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-foreground">{prospect.nome}</h1>
            {etapa && (
              <span
                className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: etapa.cor }}
              >
                {etapa.nome}
              </span>
            )}
          </div>
          {prospect.company_id && (
            <Link
              href={`/admin/empresas/${prospect.company_id}`}
              className="text-sm font-medium text-brand hover:underline"
            >
              Já é cliente ativo — ver empresa →
            </Link>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {podeEditar && etapa && (
            <MoverEtapaMenu prospectId={prospect.id} etapaAtualId={etapa.id} etapas={etapas ?? []} />
          )}
          <Link href="/admin/comercial" className="text-sm text-foreground/60 hover:underline">
            ← Voltar ao quadro
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Dados</h2>
          <EditarProspectForm prospect={prospect} podeEditar={podeEditar} />
        </Card>

        <Card className="self-start p-6">
          <h2 className="mb-4 text-sm font-semibold text-foreground/70">Anexos</h2>
          <AnexoSection prospectId={prospect.id} anexos={anexos ?? []} podeEditar={podeEditar} />
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Checklist</h2>
        <ChecklistSection prospectId={prospect.id} itens={checklist ?? []} podeEditar={podeEditar} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Comentários e atividade</h2>
        <AtividadeSection
          prospectId={prospect.id}
          atividades={
            (atividades ?? []) as unknown as {
              id: string;
              tipo: string;
              corpo: string | null;
              created_at: string;
              autor: { full_name: string } | null;
            }[]
          }
          podeEditar={podeEditar}
        />
      </Card>

      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          {etapa?.tipo !== "TERMINAL_GANHO" && !prospect.company_id ? (
            <Link href={`/admin/comercial/${prospect.id}/confirmar-cliente`}>
              <Button variant="secondary">✓ Virar Cliente Ativo…</Button>
            </Link>
          ) : (
            <span />
          )}
          <ArquivarExcluirProspect prospectId={prospect.id} arquivado={Boolean(prospect.arquivado_em)} />
        </div>
      )}
    </div>
  );
}
