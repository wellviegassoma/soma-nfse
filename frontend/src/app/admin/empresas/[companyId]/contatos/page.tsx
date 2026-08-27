import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { ContatoSetorForm } from "./ContatoSetorForm";
import { ContatosSetorList } from "./ContatosSetorList";

export const metadata = { title: "Contatos por setor — Painel SOMA" };

export default async function AdminCompanyContatosPage(
  props: PageProps<"/admin/empresas/[companyId]/contatos">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const { data: contatos } = await supabase
    .from("company_contatos_setor")
    .select("id, setor, nome, telefone, email")
    .eq("company_id", companyId)
    .order("setor", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold text-foreground/70">Novo contato por setor</h2>
        <ContatoSetorForm companyId={companyId} />
      </Card>

      {(!contatos || contatos.length === 0) ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhum contato por setor cadastrado ainda.
        </Card>
      ) : (
        <ContatosSetorList companyId={companyId} contatos={contatos} />
      )}
    </div>
  );
}
