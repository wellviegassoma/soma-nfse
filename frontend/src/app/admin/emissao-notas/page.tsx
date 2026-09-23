import { requirePermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { CompanyPicker } from "./CompanyPicker";

export const metadata = { title: "Emissão de Notas — Painel SOMA" };

export default async function EmissaoNotasPage() {
  await requirePermissao("notas.emitir");
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name")
    .eq("ativa", true)
    .order("legal_name", { ascending: true });

  const empresas = (companies ?? []).map((c) => ({
    id: c.id,
    nome: c.trade_name || c.legal_name,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Emissão de Notas</h1>
        <p className="text-sm text-foreground/60">
          Escolha a empresa pra emitir ou cancelar uma nota fiscal em nome dela.
        </p>
      </div>

      <Card className="p-6">
        <CompanyPicker empresas={empresas} />
      </Card>
    </div>
  );
}
