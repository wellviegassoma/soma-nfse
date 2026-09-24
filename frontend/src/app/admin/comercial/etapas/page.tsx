import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EtapaForm } from "./EtapaForm";
import { ToggleEtapaButton } from "./ToggleEtapaButton";

export const metadata = { title: "Etapas — Comercial" };

export default async function EtapasPage() {
  await requireSuperAdmin();

  const supabase = await createClient();
  const { data: etapas } = await supabase
    .from("comercial_etapas")
    .select("id, nome, ordem, cor, tipo, ativo")
    .order("ordem", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Etapas do funil Comercial</h1>
        <p className="text-sm text-foreground/60">
          Colunas do quadro Kanban — nome, cor, ordem e tipo. &quot;Tipo&quot; controla o
          comportamento: TERMINAL_GANHO abre a tela de confirmação e cria a empresa; as demais
          são só organização visual.
        </p>
        <Link href="/admin/comercial" className="text-sm font-medium text-foreground/60 hover:underline">
          ← Voltar ao quadro
        </Link>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Nova etapa</h2>
        <EtapaForm />
      </Card>

      <Card className="overflow-hidden">
        {!etapas || etapas.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhuma etapa cadastrada.</div>
        ) : (
          <div className="divide-y divide-border">
            {etapas.map((etapa) => (
              <div key={etapa.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 rounded-full" style={{ backgroundColor: etapa.cor }} />
                  <span className={`text-sm font-medium ${etapa.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}>
                    {etapa.nome}
                  </span>
                  <span className="text-xs text-foreground/40">{etapa.tipo}</span>
                  <span className="text-xs text-foreground/40">ordem {etapa.ordem}</span>
                </div>
                <div className="flex items-center gap-3">
                  <EtapaForm etapa={etapa} compact />
                  <ToggleEtapaButton etapaId={etapa.id} ativo={etapa.ativo} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
