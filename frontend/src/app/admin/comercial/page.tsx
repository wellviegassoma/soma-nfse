import Link from "next/link";
import { requireComercialAccess, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { KanbanBoard } from "./KanbanBoard";

export const metadata = { title: "Comercial — Painel SOMA" };

export default async function ComercialBoardPage() {
  await requireComercialAccess();
  const podeEditar = await temPermissao("comercial.editar");
  const podeConfigurarFunil = await temPermissao("configuracoes.editar");

  const supabase = await createClient();
  const [{ data: etapas }, { data: prospects }, { count: arquivadosCount }] = await Promise.all([
    supabase
      .from("comercial_etapas")
      .select("id, nome, cor, tipo, ativo")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("comercial_prospects")
      .select("id, nome, especialidade, cidade, honorario_soma, etapa_id, responsavel:profiles(full_name)")
      .is("arquivado_em", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("comercial_prospects")
      .select("id", { count: "exact", head: true })
      .not("arquivado_em", "is", null),
  ]);

  const etapasAtivas = etapas ?? [];
  const prospectsParaBoard = (prospects ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    especialidade: p.especialidade,
    cidade: p.cidade,
    honorario_soma: p.honorario_soma,
    etapa_id: p.etapa_id,
    responsavelNome: (p.responsavel as unknown as { full_name: string } | null)?.full_name ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Comercial</h1>
          <p className="text-sm text-foreground/60">
            Funil de onboarding de clientes novos — {prospects?.length ?? 0} prospects ativos.
            Arraste um card pra mover de etapa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {Boolean(arquivadosCount) && (
            <Link href="/admin/comercial/arquivados" className="text-sm font-medium text-foreground/60 hover:underline">
              Arquivados ({arquivadosCount})
            </Link>
          )}
          {podeConfigurarFunil && (
            <Link href="/admin/comercial/etapas" className="text-sm font-medium text-foreground/60 hover:underline">
              Configurar etapas
            </Link>
          )}
          {podeConfigurarFunil && (
            <Link
              href="/admin/comercial/checklist-template"
              className="text-sm font-medium text-foreground/60 hover:underline"
            >
              Checklist padrão
            </Link>
          )}
          {podeEditar && (
            <Link href="/admin/comercial/novo">
              <Button>+ Novo prospect</Button>
            </Link>
          )}
        </div>
      </div>

      {etapasAtivas.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma etapa configurada ainda.{" "}
          {podeConfigurarFunil && (
            <Link href="/admin/comercial/etapas" className="text-brand underline">
              Configure o funil
            </Link>
          )}
        </Card>
      ) : (
        <KanbanBoard etapas={etapasAtivas} prospects={prospectsParaBoard} podeEditar={podeEditar} />
      )}
    </div>
  );
}
