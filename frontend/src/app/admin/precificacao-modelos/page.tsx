import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireSomaStaff } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { buscarTodosModelos } from "@/lib/precificacao/modelos-queries";

export const metadata = { title: "Modelos de Precificação — Painel SOMA" };

export default async function PrecificacaoModelosPage() {
  await requireSomaStaff();
  const supabase = await createClient();
  const modelos = await buscarTodosModelos(supabase);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Modelos de Precificação</h1>
        <p className="text-sm text-foreground/60">
          Biblioteca de catálogos prontos (ex.: &quot;SOMA Odontologia&quot;) que qualquer empresa pode
          importar pro próprio catálogo de precificação.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground/60">{modelos.length} modelo(s) cadastrado(s)</p>
        <Link href="/admin/precificacao-modelos/novo">
          <Button>+ Novo modelo</Button>
        </Link>
      </div>

      {modelos.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">Nenhum modelo cadastrado ainda.</Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {modelos.map((modelo) => (
            <Link
              key={modelo.id}
              href={`/admin/precificacao-modelos/${modelo.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {modelo.nome}
                  {!modelo.ativo && <span className="ml-2 text-xs font-normal text-foreground/40">(inativo)</span>}
                </div>
                <div className="truncate text-xs text-foreground/50">
                  {modelo.especialidade ? `${modelo.especialidade} · ` : ""}
                  {modelo.totalInsumos} insumo(s) · {modelo.totalProcedimentos} procedimento(s)
                </div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
