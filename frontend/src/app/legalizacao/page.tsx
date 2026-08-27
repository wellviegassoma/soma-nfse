import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Legalização — Visão geral" };

const DIAS_LIMITE = 45;

type EmpresaComDocumentos = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  legalizacao_documentos: { tipo_id: string; data_vencimento: string | null }[] | null;
};

function diasAteVencer(dataVencimento: string): number {
  return Math.ceil((new Date(dataVencimento).getTime() - Date.now()) / 86_400_000);
}

export default async function LegalizacaoPage(props: PageProps<"/legalizacao">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const supabase = await createClient();
  const [{ data }, { data: tipos }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, legalizacao_documentos(tipo_id, data_vencimento)")
      .order("legal_name", { ascending: true }),
    supabase.from("legalizacao_tipos_documento").select("id, nome"),
  ]);

  const empresas = (data ?? []) as unknown as EmpresaComDocumentos[];
  const nomeTipoPorId = new Map((tipos ?? []).map((t) => [t.id, t.nome]));

  const comDocumento = empresas.filter((e) => (e.legalizacao_documentos?.length ?? 0) > 0);
  const semDocumento = empresas.filter((e) => (e.legalizacao_documentos?.length ?? 0) === 0);

  const vencendo = empresas
    .flatMap((empresa) =>
      (empresa.legalizacao_documentos ?? [])
        // Validade indeterminada nunca vence — fora da lista de vencimentos.
        .filter((doc): doc is { tipo_id: string; data_vencimento: string } => doc.data_vencimento != null)
        .map((doc) => ({
          empresa,
          tipoNome: nomeTipoPorId.get(doc.tipo_id) ?? "Tipo removido",
          dataVencimento: doc.data_vencimento,
          dias: diasAteVencer(doc.data_vencimento),
        })),
    )
    .filter((l) => l.dias <= DIAS_LIMITE)
    .sort((a, b) => a.dias - b.dias);

  const semDocumentoFiltradas = q
    ? semDocumento.filter((e) => {
        const alvo = `${e.legal_name} ${e.trade_name ?? ""}`.toLowerCase();
        return alvo.includes(q.toLowerCase());
      })
    : semDocumento;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Legalização</h1>
        <p className="text-sm text-foreground/60">
          Controle de documentos de legalização por empresa — validade e cadastro pendente.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Empresas cadastradas</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{empresas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Com algum documento</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{comDocumento.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Sem nenhum documento</div>
          <div className="mt-1 text-lg font-semibold text-danger">{semDocumento.length}</div>
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
            Nenhum documento vencido ou vencendo nos próximos {DIAS_LIMITE} dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {vencendo.map(({ empresa, tipoNome, dataVencimento, dias }) => (
              <Link
                key={`${empresa.id}-${tipoNome}`}
                href={`/legalizacao/empresas/${empresa.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="truncate text-xs text-foreground/50">
                    {tipoNome} — vence em {new Date(dataVencimento).toLocaleDateString("pt-BR")}
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
            Sem nenhum documento cadastrado ({semDocumento.length})
          </div>
          <form className="flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Buscar por nome..." className="w-56" />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
            {q && (
              <Link href="/legalizacao">
                <Button type="button" variant="ghost">
                  Limpar
                </Button>
              </Link>
            )}
          </form>
        </div>
        {semDocumentoFiltradas.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            {q
              ? `Nenhuma empresa sem documento encontrada para "${q}".`
              : "Todas as empresas têm pelo menos um documento cadastrado."}
          </div>
        ) : (
          <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            {semDocumentoFiltradas.map((empresa) => (
              <Link
                key={empresa.id}
                href={`/legalizacao/empresas/${empresa.id}`}
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
