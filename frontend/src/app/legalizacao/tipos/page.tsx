import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { NovoTipoDocumentoForm } from "./NovoTipoDocumentoForm";
import { ToggleTipoDocumentoButton } from "./ToggleTipoDocumentoButton";

export const metadata = { title: "Tipos de documento — Legalização" };

export default async function TiposDocumentoPage() {
  const supabase = await createClient();

  const { data: tipos } = await supabase
    .from("legalizacao_tipos_documento")
    .select("id, nome, ativo")
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
              <div key={tipo.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <span
                  className={`text-sm font-medium ${tipo.ativo ? "text-foreground" : "text-foreground/40 line-through"}`}
                >
                  {tipo.nome}
                </span>
                <ToggleTipoDocumentoButton tipoId={tipo.id} ativo={tipo.ativo} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
