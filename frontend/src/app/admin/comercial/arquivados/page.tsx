import Link from "next/link";
import { requireComercialAccess, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { DesarquivarButton } from "./DesarquivarButton";

export const metadata = { title: "Arquivados — Comercial" };

export default async function ArquivadosPage() {
  await requireComercialAccess();
  const podeEditar = await temPermissao("comercial.editar");

  const supabase = await createClient();
  const { data: prospects } = await supabase
    .from("comercial_prospects")
    .select("id, nome, especialidade, cidade, arquivado_em, etapa:comercial_etapas(nome, cor)")
    .not("arquivado_em", "is", null)
    .order("arquivado_em", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Prospects arquivados</h1>
        <p className="text-sm text-foreground/60">
          Some do quadro, mas nada é apagado — desarquive pra voltar de onde parou.
        </p>
        <Link href="/admin/comercial" className="text-sm font-medium text-foreground/60 hover:underline">
          ← Voltar ao quadro
        </Link>
      </div>

      <Card className="overflow-hidden">
        {!prospects || prospects.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">Nenhum prospect arquivado.</div>
        ) : (
          <div className="divide-y divide-border">
            {prospects.map((prospect) => {
              const etapa = prospect.etapa as unknown as { nome: string; cor: string } | null;
              const especialidadeECidade = [prospect.especialidade, prospect.cidade]
                .filter(Boolean)
                .join(" · ");
              return (
                <div
                  key={prospect.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div>
                    <Link
                      href={`/admin/comercial/${prospect.id}`}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {prospect.nome}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-foreground/50">
                      {etapa && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                          style={{ backgroundColor: etapa.cor }}
                        >
                          {etapa.nome}
                        </span>
                      )}
                      {especialidadeECidade && <span>{especialidadeECidade}</span>}
                      <span>
                        arquivado em{" "}
                        {new Date(prospect.arquivado_em as string).toLocaleDateString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  {podeEditar && <DesarquivarButton prospectId={prospect.id} />}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
