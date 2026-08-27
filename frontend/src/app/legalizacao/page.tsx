import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BuscaRapidaEmpresa } from "./BuscaRapidaEmpresa";

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
  const [{ data }, { data: tipos }, { data: naoAplicaveis }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, legal_name, trade_name, legalizacao_documentos(tipo_id, data_vencimento)")
      .order("legal_name", { ascending: true }),
    supabase.from("legalizacao_tipos_documento").select("id, nome").eq("ativo", true),
    supabase.from("legalizacao_tipos_nao_aplicaveis").select("company_id, tipo_id"),
  ]);

  const empresas = (data ?? []) as unknown as EmpresaComDocumentos[];
  const nomeTipoPorId = new Map((tipos ?? []).map((t) => [t.id, t.nome]));
  const todosTipoIds = (tipos ?? []).map((t) => t.id);

  const naoAplicaveisPorEmpresa = new Map<string, Set<string>>();
  for (const row of naoAplicaveis ?? []) {
    if (!naoAplicaveisPorEmpresa.has(row.company_id)) naoAplicaveisPorEmpresa.set(row.company_id, new Set());
    naoAplicaveisPorEmpresa.get(row.company_id)!.add(row.tipo_id);
  }

  // Documentação completa = todo tipo aplicável a essa empresa (catálogo
  // menos os marcados como "não se aplica") já tem documento cadastrado.
  const incompletas = empresas.filter((e) => {
    const excluidos = naoAplicaveisPorEmpresa.get(e.id) ?? new Set<string>();
    const aplicaveis = todosTipoIds.filter((id) => !excluidos.has(id));
    if (aplicaveis.length === 0) return false;
    const cadastrados = new Set((e.legalizacao_documentos ?? []).map((d) => d.tipo_id));
    return aplicaveis.some((id) => !cadastrados.has(id));
  });
  const comDocumento = empresas.filter((e) => (e.legalizacao_documentos?.length ?? 0) > 0);

  const vencendoPorTipo = new Map<
    string,
    { empresa: EmpresaComDocumentos; dataVencimento: string; dias: number }[]
  >();
  for (const empresa of empresas) {
    for (const doc of empresa.legalizacao_documentos ?? []) {
      // Validade indeterminada nunca vence — fora da lista de vencimentos.
      if (doc.data_vencimento == null) continue;
      const dias = diasAteVencer(doc.data_vencimento);
      if (dias > DIAS_LIMITE) continue;
      const tipoNome = nomeTipoPorId.get(doc.tipo_id) ?? "Tipo removido";
      if (!vencendoPorTipo.has(tipoNome)) vencendoPorTipo.set(tipoNome, []);
      vencendoPorTipo.get(tipoNome)!.push({ empresa, dataVencimento: doc.data_vencimento, dias });
    }
  }
  const gruposVencendo = [...vencendoPorTipo.entries()]
    .map(([tipoNome, itens]) => ({ tipoNome, itens: itens.sort((a, b) => a.dias - b.dias) }))
    .sort((a, b) => a.itens[0].dias - b.itens[0].dias);
  const totalVencendo = gruposVencendo.reduce((soma, g) => soma + g.itens.length, 0);

  const incompletasFiltradas = q
    ? incompletas.filter((e) => {
        const alvo = `${e.legal_name} ${e.trade_name ?? ""}`.toLowerCase();
        return alvo.includes(q.toLowerCase());
      })
    : incompletas;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Legalização</h1>
        <p className="text-sm text-foreground/60">
          Controle de documentos de legalização por empresa — validade e cadastro pendente.
        </p>
      </div>

      <BuscaRapidaEmpresa
        empresas={empresas.map((e) => ({ id: e.id, legal_name: e.legal_name, trade_name: e.trade_name }))}
      />

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
          <div className="text-xs text-foreground/50">Documentação incompleta</div>
          <div className="mt-1 text-lg font-semibold text-danger">{incompletas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">
            Vencidos ou vencendo em {DIAS_LIMITE} dias
          </div>
          <div className="mt-1 text-lg font-semibold text-warning">{totalVencendo}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Vencidos ou vencendo em até {DIAS_LIMITE} dias — separado por tipo de documento
        </div>
        {gruposVencendo.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhum documento vencido ou vencendo nos próximos {DIAS_LIMITE} dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {gruposVencendo.map(({ tipoNome, itens }) => (
              <div key={tipoNome}>
                <div className="bg-surface-muted/50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/50">
                  {tipoNome} ({itens.length})
                </div>
                <div className="divide-y divide-border">
                  {itens.map(({ empresa, dataVencimento, dias }) => (
                    <Link
                      key={empresa.id}
                      href={`/legalizacao/empresas/${empresa.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {empresa.trade_name || empresa.legal_name}
                        </div>
                        <div className="truncate text-xs text-foreground/50">
                          Vence em {new Date(dataVencimento).toLocaleDateString("pt-BR")}
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
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-foreground/70">
            Documentação incompleta ({incompletas.length})
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
        {incompletasFiltradas.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            {q
              ? `Nenhuma empresa com documentação incompleta encontrada para "${q}".`
              : "Todas as empresas têm a documentação aplicável em dia."}
          </div>
        ) : (
          <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
            {incompletasFiltradas.map((empresa) => (
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
