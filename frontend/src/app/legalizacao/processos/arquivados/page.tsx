import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { TIPO_PROCESSO_LABELS } from "@/app/legalizacao/processos/status";
import { DesarquivarProcessoButton } from "./DesarquivarProcessoButton";

export const metadata = { title: "Arquivados — Legalização" };

export default async function ProcessosArquivadosPage() {
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");

  const supabase = await createClient();
  const { data: processos } = await supabase
    .from("legalizacao_processos")
    .select("id, tipo_processo, nome, fluxo_nome, arquivado_em")
    .not("arquivado_em", "is", null)
    .order("arquivado_em", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Processos arquivados</h1>
        <p className="text-sm text-foreground/60">
          Somem da lista principal, mas nada é apagado — desarquive pra voltar de onde parou.
        </p>
        <Link href="/legalizacao/processos" className="text-sm font-medium text-foreground/60 hover:underline">
          ← Voltar aos processos
        </Link>
      </div>

      <Card className="overflow-hidden">
        {!processos || processos.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhum processo arquivado.</div>
        ) : (
          <div className="divide-y divide-border">
            {processos.map((processo) => (
              <div key={processo.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link
                    href={`/legalizacao/processos/${processo.id}`}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {processo.nome}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                    <span>{TIPO_PROCESSO_LABELS[processo.tipo_processo]}</span>
                    <span>·</span>
                    <span>{processo.fluxo_nome}</span>
                    <span>·</span>
                    <span>arquivado em {new Date(processo.arquivado_em as string).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                {podeEditar && <DesarquivarProcessoButton processoId={processo.id} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
