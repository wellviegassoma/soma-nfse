import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BuscaRapidaEmpresa } from "./BuscaRapidaEmpresa";
import { tipoAplicavel } from "./status";

export const metadata = { title: "Legalização — Visão geral" };

const DIAS_LIMITE = 45;

type EmpresaComDocumentos = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  municipality_name: string | null;
  state: string | null;
  legalizacao_documentos: { tipo_id: string; data_vencimento: string | null }[] | null;
};

type CertificadoVencendo = { company_id: string; expires_at: string };

function diasAteVencer(dataVencimento: string): number {
  return Math.ceil((new Date(dataVencimento).getTime() - Date.now()) / 86_400_000);
}

export default async function LegalizacaoPage(props: PageProps<"/legalizacao">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  const supabase = await createClient();
  const [{ data }, { data: tipos }, { data: excecoes }, { data: certificadosVencendo }] =
    await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, legal_name, trade_name, municipality_name, state, legalizacao_documentos(tipo_id, data_vencimento)",
        )
        .order("legal_name", { ascending: true }),
      supabase.from("legalizacao_tipos_documento").select("id, nome, aplica_a_todas").eq("ativo", true),
      supabase.from("legalizacao_tipos_empresas_excecao").select("company_id, tipo_id, aplicavel"),
      supabase.rpc("certificados_vencendo_legalizacao") as unknown as Promise<{
        data: CertificadoVencendo[] | null;
      }>,
    ]);

  const empresas = (data ?? []) as unknown as EmpresaComDocumentos[];
  const nomePorEmpresa = new Map(empresas.map((e) => [e.id, e.trade_name || e.legal_name]));
  const nomeTipoPorId = new Map((tipos ?? []).map((t) => [t.id, t.nome]));

  const excecaoPorEmpresaETipo = new Map<string, boolean>();
  for (const row of excecoes ?? []) {
    excecaoPorEmpresaETipo.set(`${row.company_id}:${row.tipo_id}`, row.aplicavel);
  }

  // Pra cada empresa, quantos tipos aplicáveis estão sem documento cadastrado
  // e quantos têm documento cadastrado mas vencido — as duas coisas juntas
  // formam a "pendência" da empresa.
  const pendenciaPorEmpresa = empresas
    .map((e) => {
      const aplicaveis = (tipos ?? []).filter((tipo) =>
        tipoAplicavel(tipo.aplica_a_todas, excecaoPorEmpresaETipo.get(`${e.id}:${tipo.id}`)),
      );
      const documentoPorTipo = new Map((e.legalizacao_documentos ?? []).map((d) => [d.tipo_id, d]));
      let faltando = 0;
      let vencido = 0;
      for (const tipo of aplicaveis) {
        const doc = documentoPorTipo.get(tipo.id);
        if (!doc) faltando += 1;
        else if (doc.data_vencimento != null && diasAteVencer(doc.data_vencimento) < 0) vencido += 1;
      }
      return { empresa: e, aplicaveis: aplicaveis.length, faltando, vencido, pendencias: faltando + vencido };
    })
    .filter((p) => p.aplicaveis > 0);

  const incompletas = pendenciaPorEmpresa
    .filter((p) => p.pendencias > 0)
    .sort((a, b) => b.pendencias - a.pendencias || a.empresa.legal_name.localeCompare(b.empresa.legal_name));
  const tudoOk = pendenciaPorEmpresa.filter((p) => p.pendencias === 0);

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

  const certificadosVencendoOrdenados = (certificadosVencendo ?? [])
    .map((c) => ({ empresaNome: nomePorEmpresa.get(c.company_id), ...c, dias: diasAteVencer(c.expires_at) }))
    .filter((c) => c.empresaNome != null && c.dias <= DIAS_LIMITE)
    .sort((a, b) => a.dias - b.dias);

  const empresasPorCidade = new Map<string, number>();
  let semCidade = 0;
  for (const empresa of empresas) {
    if (!empresa.municipality_name) {
      semCidade += 1;
      continue;
    }
    const chave = empresa.state ? `${empresa.municipality_name}/${empresa.state}` : empresa.municipality_name;
    empresasPorCidade.set(chave, (empresasPorCidade.get(chave) ?? 0) + 1);
  }
  const rankingCidades = [...empresasPorCidade.entries()]
    .map(([cidade, total]) => ({ cidade, total }))
    .sort((a, b) => b.total - a.total);

  const incompletasFiltradas = q
    ? incompletas.filter((p) => {
        const alvo = `${p.empresa.legal_name} ${p.empresa.trade_name ?? ""}`.toLowerCase();
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
          <div className="text-xs text-foreground/50">Empresas com tudo OK</div>
          <div className="mt-1 text-lg font-semibold text-success">{tudoOk.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Documentação incompleta</div>
          <div className="mt-1 text-lg font-semibold text-danger">{incompletas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">
            Documentos vencidos ou vencendo em {DIAS_LIMITE} dias
          </div>
          <div className="mt-1 text-lg font-semibold text-warning">{totalVencendo}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Ranking de empresas por cidade
        </div>
        {rankingCidades.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhuma empresa com cidade cadastrada ainda.
          </div>
        ) : (
          <div className="max-h-80 divide-y divide-border overflow-y-auto">
            {rankingCidades.map(({ cidade, total }) => (
              <div key={cidade} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span className="truncate text-sm text-foreground">{cidade}</span>
                <span className="shrink-0 text-sm font-medium text-foreground/70">{total}</span>
              </div>
            ))}
            {semCidade > 0 && (
              <div className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span className="truncate text-sm text-foreground/40">Sem cidade cadastrada</span>
                <span className="shrink-0 text-sm font-medium text-foreground/40">{semCidade}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Certificados digitais vencidos ou vencendo em até {DIAS_LIMITE} dias
        </div>
        {certificadosVencendoOrdenados.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Nenhum certificado digital vencido ou vencendo nos próximos {DIAS_LIMITE} dias.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {certificadosVencendoOrdenados.map((c) => (
              <Link
                key={c.company_id}
                href={`/legalizacao/empresas/${c.company_id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{c.empresaNome}</div>
                  <div className="truncate text-xs text-foreground/50">
                    Certificado A1 vence em {new Date(c.expires_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                    c.dias < 0 ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
                  }`}
                >
                  {c.dias < 0 ? `Vencido há ${Math.abs(c.dias)} dia(s)` : `Vence em ${c.dias} dia(s)`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Documentos de legalização vencidos ou vencendo em até {DIAS_LIMITE} dias — separado por tipo
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
            Ranking de documentação incompleta ({incompletas.length})
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
            {incompletasFiltradas.map(({ empresa, aplicaveis, faltando, vencido }) => (
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
                <span className="shrink-0 rounded-full bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
                  {faltando > 0 && vencido > 0
                    ? `${faltando} faltando, ${vencido} vencido(s)`
                    : faltando > 0
                      ? `${faltando} de ${aplicaveis} faltando`
                      : `${vencido} vencido(s)`}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
