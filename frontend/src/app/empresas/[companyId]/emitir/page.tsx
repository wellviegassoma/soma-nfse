import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmitirNotaForm } from "./EmitirNotaForm";

export const metadata = { title: "Emitir nota — SOMA NFS-e" };

export default async function EmitirNotaPage(
  props: PageProps<"/empresas/[companyId]/emitir">,
) {
  const { companyId } = await props.params;
  const supabase = await createClient();

  const [{ data: customers }, { data: services }] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, cpf_cnpj")
      .eq("company_id", companyId)
      .order("name"),
    supabase
      .from("services")
      .select("id, name, description")
      .eq("company_id", companyId)
      .eq("active", true)
      .order("name"),
  ]);

  if (!services || services.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm font-medium text-foreground/70">
          Nenhum serviço ativo cadastrado
        </p>
        <p className="mt-1 text-sm text-foreground/50">
          Peça pra SOMA cadastrar pelo menos um serviço antes de emitir notas.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Emitir nota</h1>
        <Link
          href={`/empresas/${companyId}/tomadores/novo`}
          className="text-sm font-medium text-brand hover:underline"
        >
          + Novo tomador
        </Link>
      </div>

      <Card className="max-w-lg p-6 sm:p-8">
        <EmitirNotaForm
          companyId={companyId}
          customers={customers ?? []}
          services={services}
        />
      </Card>
    </div>
  );
}
