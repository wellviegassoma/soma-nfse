import { notFound } from "next/navigation";
import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { ConfirmarClienteForm } from "./ConfirmarClienteForm";

export const metadata = { title: "Virar Cliente Ativo — Comercial" };

export default async function ConfirmarClientePage(
  props: PageProps<"/admin/comercial/[prospectId]/confirmar-cliente">,
) {
  const { prospectId } = await props.params;
  await requirePermissao("comercial.editar");

  const supabase = await createClient();
  const { data: prospect } = await supabase
    .from("comercial_prospects")
    .select("id, nome, pessoa_tipo, cnpj, cpf, regime_tributario, cidade, company_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (!prospect) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Virar Cliente Ativo</h1>

      {prospect.company_id ? (
        <Alert tone="warning">
          Esse prospect já tem uma empresa vinculada — confirmar de novo só move a etapa, não cria
          outra empresa.
        </Alert>
      ) : (
        <p className="text-sm text-foreground/60">
          Confira e complete os dados antes de confirmar — isso cria a empresa de verdade no
          sistema, com fatura e emissão de nota disponíveis a partir de agora.
        </p>
      )}

      <Card className="max-w-lg p-6 sm:p-8">
        <ConfirmarClienteForm prospect={prospect} />
      </Card>
    </div>
  );
}
