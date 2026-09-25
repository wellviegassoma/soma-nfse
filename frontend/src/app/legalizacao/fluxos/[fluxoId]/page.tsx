import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TIPO_PROCESSO_LABELS } from "@/app/legalizacao/processos/status";
import { FaseTemplateForm } from "./FaseTemplateForm";
import { ToggleFaseTemplateButton } from "./ToggleFaseTemplateButton";

export const metadata = { title: "Fases do fluxo — Legalização" };

export default async function FluxoDetailPage(
  props: PageProps<"/legalizacao/fluxos/[fluxoId]">,
) {
  const { fluxoId } = await props.params;
  await requirePermissao("legalizacao.editar");

  const supabase = await createClient();
  const [{ data: fluxo }, { data: fases }, { data: tiposDocumento }] = await Promise.all([
    supabase.from("legalizacao_fluxos").select("id, nome, tipo_processo").eq("id", fluxoId).maybeSingle(),
    supabase
      .from("legalizacao_fluxo_fases_template")
      .select("id, nome, ordem, descricao, acao, tipo_documento_id, ativo")
      .eq("fluxo_id", fluxoId)
      .order("ordem", { ascending: true }),
    supabase.from("legalizacao_tipos_documento").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  if (!fluxo) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/legalizacao/fluxos" className="text-xs text-brand underline">
          ← Voltar aos fluxos
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{fluxo.nome}</h1>
        <p className="text-sm text-foreground/60">
          {TIPO_PROCESSO_LABELS[fluxo.tipo_processo]} — {(fases ?? []).length} fase(s) no template.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Nova fase</h2>
        <FaseTemplateForm fluxoId={fluxo.id} tiposDocumento={tiposDocumento ?? []} />
      </Card>

      <Card className="overflow-hidden">
        {!fases || fases.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhuma fase cadastrada.</div>
        ) : (
          <div className="divide-y divide-border">
            {fases.map((fase) => (
              <div key={fase.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${fase.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}>
                      {fase.ordem} — {fase.nome}
                    </span>
                    {fase.acao === "CRIAR_EMPRESA" && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        cria empresa
                      </span>
                    )}
                  </div>
                  {fase.descricao && <div className="text-xs text-foreground/40">{fase.descricao}</div>}
                </div>
                <div className="flex items-center gap-3">
                  <FaseTemplateForm fluxoId={fluxo.id} fase={fase} tiposDocumento={tiposDocumento ?? []} compact />
                  <ToggleFaseTemplateButton faseId={fase.id} fluxoId={fluxo.id} ativo={fase.ativo} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
