import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NovoTipoDocumentoForm } from "./NovoTipoDocumentoForm";
import { ToggleTipoDocumentoButton } from "./ToggleTipoDocumentoButton";
import { ModoAplicacaoTipoToggle } from "./ModoAplicacaoTipoToggle";

export const metadata = { title: "Tipos de documento — Legalização" };

export default async function TiposDocumentoPage() {
  const supabase = await createClient();

  const { data: tipos } = await supabase
    .from("legalizacao_tipos_documento")
    .select("id, nome, ativo, aplica_a_todas")
    .order("nome", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Tipos de documento</h1>
        <p className="text-sm text-foreground/60">
          Catálogo de tipos de documento de legalização disponíveis pra cadastrar por empresa.
          Nem toda empresa precisa de todo tipo — inative um tipo em vez de tentar apagar depois
          que já tiver documento cadastrado com ele.
        </p>
      </div>

      <Card className="p-6">
        <NovoTipoDocumentoForm />
      </Card>

      <Card className="overflow-hidden">
        {!tipos || tipos.length === 0 ? (
          <div className="p-10 text-center text-sm text-foreground/50">
            Nenhum tipo de documento cadastrado ainda.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {tipos.map((tipo) => (
              <div key={tipo.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <span
                  className={`text-sm font-medium ${tipo.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}
                >
                  {tipo.nome}
                </span>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/legalizacao/tipos/${tipo.id}/empresas`}
                    className="text-xs text-brand underline"
                  >
                    Gerenciar empresas
                  </Link>
                  <ModoAplicacaoTipoToggle tipoId={tipo.id} aplicaATodas={tipo.aplica_a_todas} />
                  <ToggleTipoDocumentoButton tipoId={tipo.id} ativo={tipo.ativo} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
