import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatarDocumentoEmpresa } from "@/lib/formatters";

export const metadata = { title: "Empresas — Painel SOMA" };

export default async function AdminEmpresasPage(props: PageProps<"/admin/empresas">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj, cpf, created_at")
    .order("legal_name", { ascending: true });

  if (q) {
    // PostgREST usa vírgula/parênteses como separador na sintaxe de `.or()`
    // — precisa tirar do termo de busca pra não quebrar o filtro.
    const termoSeguro = q.replace(/[,()]/g, " ").trim();
    const digits = q.replace(/\D/g, "");
    const termos = [`legal_name.ilike.%${termoSeguro}%`, `trade_name.ilike.%${termoSeguro}%`];
    if (digits) termos.push(`cnpj.ilike.%${digits}%`, `cpf.ilike.%${digits}%`);
    if (termoSeguro || digits) query = query.or(termos.join(","));
  }

  const { data: companies, error } = await query;

  if (error) throw error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Empresas</h1>
          <p className="text-sm text-foreground/60">
            {companies?.length ?? 0} empresa(s) {q ? "encontrada(s)" : "cadastrada(s)"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/empresas/importar">
            <Button variant="secondary">Importar planilha</Button>
          </Link>
          <Link href="/admin/empresas/novo">
            <Button>+ Nova empresa</Button>
          </Link>
        </div>
      </div>

      <form className="flex gap-3">
        <Input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome ou CNPJ..."
          className="max-w-sm"
        />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        {q && (
          <Link href="/admin/empresas">
            <Button type="button" variant="ghost">
              Limpar
            </Button>
          </Link>
        )}
      </form>

      {!companies || companies.length === 0 ? (
        <Card className="p-10 text-center text-sm text-foreground/50">
          {q ? `Nenhuma empresa encontrada para "${q}".` : "Nenhuma empresa cadastrada ainda."}
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {companies.map((company) => {
            const documento = formatarDocumentoEmpresa(company);
            return (
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
                  {documento ? `${documento.label}: ${documento.valor}` : "CNPJ/CPF pendente"}
                </div>
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
