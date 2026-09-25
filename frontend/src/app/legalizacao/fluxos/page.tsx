import Link from "next/link";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TIPO_PROCESSO_LABELS } from "@/app/legalizacao/processos/status";
import { FluxoForm } from "./FluxoForm";
import { ToggleFluxoButton } from "./ToggleFluxoButton";

export const metadata = { title: "Fluxos — Legalização" };

export default async function FluxosPage() {
  await requirePermissao("legalizacao.editar");

  const supabase = await createClient();
  const { data: fluxos } = await supabase
    .from("legalizacao_fluxos")
    .select("id, chave, nome, tipo_processo, prazo_padrao_dias, ordem, ativo")
    .order("ordem", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Fluxos de processo</h1>
        <p className="text-sm text-foreground/60">
          Templates de fase usados ao criar um processo — editar aqui não muda processos já em
          andamento (as fases são copiadas na criação).
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Novo fluxo</h2>
        <FluxoForm />
      </Card>

      <Card className="overflow-hidden">
        {!fluxos || fluxos.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhum fluxo cadastrado.</div>
        ) : (
          <div className="divide-y divide-border">
            {fluxos.map((fluxo) => (
              <div key={fluxo.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/legalizacao/fluxos/${fluxo.id}`}
                      className={`text-sm font-medium hover:underline ${fluxo.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}
                    >
                      {fluxo.nome}
                    </Link>
                    <span className="text-xs text-foreground/40">{TIPO_PROCESSO_LABELS[fluxo.tipo_processo]}</span>
                  </div>
                  <div className="text-xs text-foreground/40">
                    {fluxo.chave} · ordem {fluxo.ordem}
                    {fluxo.prazo_padrao_dias ? ` · prazo padrão ${fluxo.prazo_padrao_dias}d` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/legalizacao/fluxos/${fluxo.id}`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Gerenciar fases
                  </Link>
                  <ToggleFluxoButton fluxoId={fluxo.id} ativo={fluxo.ativo} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
