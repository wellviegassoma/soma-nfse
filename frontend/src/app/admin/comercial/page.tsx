import Link from "next/link";
import { requireComercialAccess, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MoverEtapaMenu } from "./MoverEtapaMenu";

export const metadata = { title: "Comercial — Painel SOMA" };

function formatMoney(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function ComercialBoardPage() {
  await requireComercialAccess();
  const podeEditar = await temPermissao("comercial.editar");
  const podeConfigurarFunil = await temPermissao("configuracoes.editar");

  const supabase = await createClient();
  const [{ data: etapas }, { data: prospects }] = await Promise.all([
    supabase
      .from("comercial_etapas")
      .select("id, nome, cor, tipo, ativo")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    supabase
      .from("comercial_prospects")
      .select("id, nome, especialidade, honorario_soma, etapa_id, responsavel:profiles(full_name)")
      .order("updated_at", { ascending: false }),
  ]);

  const etapasAtivas = etapas ?? [];
  const etapasMovimentaveis = etapasAtivas.filter((e) => e.tipo !== "TERMINAL_GANHO");
  const porEtapa = new Map<string, typeof prospects>();
  for (const p of prospects ?? []) {
    const lista = porEtapa.get(p.etapa_id) ?? [];
    lista.push(p);
    porEtapa.set(p.etapa_id, lista);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Comercial</h1>
          <p className="text-sm text-foreground/60">
            Funil de onboarding de clientes novos — {prospects?.length ?? 0} prospects ativos.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
        <div className="flex gap-4 overflow-x-auto pb-4">
          {etapasAtivas.map((etapa) => {
            const cards = porEtapa.get(etapa.id) ?? [];
            return (
              <div key={etapa.id} className="flex w-72 shrink-0 flex-col gap-3">
                <div
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: etapa.cor }}
                >
                  <span>{etapa.nome}</span>
                  <span className="rounded-full bg-black/15 px-2 py-0.5 text-xs">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.map((prospect) => (
                    <Card key={prospect.id} className="p-3">
                      <Link
                        href={`/admin/comercial/${prospect.id}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {prospect.nome}
                      </Link>
                      {prospect.especialidade && (
                        <p className="mt-0.5 text-xs text-foreground/50">{prospect.especialidade}</p>
                      )}
                      <div className="mt-1 flex items-center justify-between text-xs text-foreground/50">
                        <span>{formatMoney(prospect.honorario_soma) ?? "—"}</span>
                        <span>
                          {(prospect.responsavel as unknown as { full_name: string } | null)?.full_name ?? "—"}
                        </span>
                      </div>
                      {podeEditar && (
                        <div className="mt-2 border-t border-border pt-2">
                          <MoverEtapaMenu
                            prospectId={prospect.id}
                            etapaAtualId={etapa.id}
                            etapas={etapasMovimentaveis}
                          />
                        </div>
                      )}
                    </Card>
                  ))}
                  {cards.length === 0 && (
                    <p className="px-1 text-xs text-foreground/40">Nenhum prospect nessa etapa.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
