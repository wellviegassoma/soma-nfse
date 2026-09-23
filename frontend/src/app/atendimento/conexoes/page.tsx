import { createClient } from "@/lib/supabase/server";
import { ConexaoCard } from "@/components/atendimento/ConexaoCard";
import { NovaConexaoForm } from "@/components/atendimento/NovaConexaoForm";

export const metadata = { title: "Atendimento — Conexões" };

export default async function ConexoesPage() {
  const supabase = await createClient();
  const [{ data: conexoes }, { data: departamentos }] = await Promise.all([
    supabase
      .from("atendimento_conexoes")
      .select("id, nome, tipo, numero, status, qr_code, departamento_padrao_id")
      .order("created_at", { ascending: true }),
    supabase.from("atendimento_departamentos").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="space-y-6 overflow-y-auto p-6">
      <h1 className="text-lg font-semibold text-foreground">Conexões</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(conexoes ?? []).map((conexao) => (
          <ConexaoCard key={conexao.id} conexao={conexao} />
        ))}
      </div>
      <NovaConexaoForm departamentos={departamentos ?? []} />
    </div>
  );
}
