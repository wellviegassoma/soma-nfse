import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Certificados — Painel SOMA" };

const DIAS_LIMITE = 45;

type EmpresaComCertificado = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  // company_id em `certificates` é UNIQUE (1 certificado por empresa) — o
  // PostgREST detecta a relação 1:1 e embute como objeto único, não array.
  certificates: { expires_at: string } | null;
};

function diasAteVencer(expiresAt: string): number {
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
}

export default async function AdminCertificadosPage(props: PageProps<"/admin/certificados">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, certificates(expires_at)")
    .order("legal_name", { ascending: true });

  const empresas = (data ?? []) as unknown as EmpresaComCertificado[];

  const comCertificado = empresas.filter((e) => e.certificates != null);
  const semCertificado = empresas.filter((e) => e.certificates == null);

  const vencendo = comCertificado
    .map((e) => ({ empresa: e, dias: diasAteVencer(e.certificates!.expires_at) }))
    .filter((l) => l.dias <= DIAS_LIMITE)
    .sort((a, b) => a.dias - b.dias);

  const semCertificadoFiltradas = q
    ? semCertificado.filter((e) => {
        const alvo = `${e.legal_name} ${e.trade_name ?? ""}`.toLowerCase();
        return alvo.includes(q.toLowerCase());
      })
    : semCertificado;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Certificados</h1>
        <p className="text-sm text-foreground/60">
          Controle de certificado digital A1 por empresa — validade e cadastro pendente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Empresas cadastradas</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{empresas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Com certificado</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{comCertificado.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Sem certificado</div>
          <div className="mt-1 text-lg font-semibold text-danger">{semCertificado.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">
            Vencidos ou vencendo em {DIAS_LIMITE} dias
          </div>
          <div className="mt-1 text-lg font-semibold text-warning">{vencendo.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Vencidos ou vencendo em até {DIAS_LIMITE} dias
        </div>
        {vencendo.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhum certificado vencido ou vencendo nos próximos {DIAS_LIMITE} dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {vencendo.map(({ empresa, dias }) => (
              <Link
                key={empresa.id}
                href={`/admin/empresas/${empresa.id}/certificado`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    Vence em{" "}
                    {new Date(empresa.certificates!.expires_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    dias < 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  {dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-foreground/70">
            Sem certificado cadastrado ({semCertificado.length})
          </div>
          <form className="flex gap-2">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nome..."
              className="w-56"
            />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
            {q && (
              <Link href="/admin/certificados">
                <Button type="button" variant="ghost">
                  Limpar
                </Button>
              </Link>
            )}
          </form>
        </div>
        {semCertificadoFiltradas.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            {q
              ? `Nenhuma empresa sem certificado encontrada para "${q}".`
              : "Todas as empresas têm certificado cadastrado."}
          </div>
        ) : (
          <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            {semCertificadoFiltradas.map((empresa) => (
              <Link
                key={empresa.id}
                href={`/admin/empresas/${empresa.id}/certificado`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="truncate text-xs text-foreground/50">{empresa.legal_name}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
