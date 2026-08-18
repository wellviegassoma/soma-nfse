import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Empresas — Painel SOMA" };

export default async function AdminEmpresasPage() {
  const supabase = await createClient();
  const { data: companies, error } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Empresas</h1>
          <p className="text-sm text-foreground/60">
            {companies?.length ?? 0} empresa(s) cadastrada(s)
          </p>
        </div>
        <Link href="/admin/empresas/novo">
          <Button>+ Nova empresa</Button>
        </Link>
      </div>

      {!companies || companies.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          Nenhuma empresa cadastrada ainda.
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/admin/empresas/${company.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-surface-muted"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">
                  {company.trade_name || company.legal_name}
                </div>
                <div className="truncate text-xs text-foreground/50">
                  {company.legal_name}
                </div>
              </div>
              <div className="shrink-0 text-xs text-foreground/50">
                {company.cnpj || "CNPJ pendente"}
              </div>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
