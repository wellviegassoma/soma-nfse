import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { BuscaRapidaEmpresa } from "@/components/BuscaRapidaEmpresa";
import { mesCorrenteBrasilia } from "@/lib/competencia";

export const metadata = { title: "Extratos — Visão geral" };

type EmpresaComContas = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  extrato_contas_bancarias: { id: string; ativo: boolean }[] | null;
};

export default async function ExtratosPage(props: PageProps<"/extratos">) {
  const searchParams = await props.searchParams;
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const competenciaAtual = mesCorrenteBrasilia();

  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, extrato_contas_bancarias(id, ativo)")
    .order("legal_name", { ascending: true });

  const empresas = (data ?? []) as unknown as EmpresaComContas[];
  const comConta = empresas.filter(
    (e) => (e.extrato_contas_bancarias ?? []).some((c) => c.ativo),
  );

  const todasContaIds = comConta.flatMap((e) =>
    (e.extrato_contas_bancarias ?? []).filter((c) => c.ativo).map((c) => c.id),
  );
  const { data: extratosCompetenciaAtual } = todasContaIds.length
    ? await supabase
        .from("extratos_mensais")
        .select("conta_id, entregue")
        .eq("competencia", competenciaAtual)
        .in("conta_id", todasContaIds)
    : { data: [] };

  const entreguesPorConta = new Set(
    (extratosCompetenciaAtual ?? []).filter((e) => e.entregue).map((e) => e.conta_id),
  );

  const resumoPorEmpresa = comConta
    .map((empresa) => {
      const contasAtivas = (empresa.extrato_contas_bancarias ?? []).filter((c) => c.ativo);
      const entregues = contasAtivas.filter((c) => entreguesPorConta.has(c.id)).length;
      return { empresa, totalContas: contasAtivas.length, entregues };
    })
    .filter((l) => l.entregues < l.totalContas)
    .sort((a, b) => a.entregues / a.totalContas - b.entregues / b.totalContas);

  const empresasFiltradas = q
    ? empresas.filter((e) => {
        const alvo = `${e.legal_name} ${e.trade_name ?? ""}`.toLowerCase();
        return alvo.includes(q.toLowerCase());
      })
    : empresas;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Extratos</h1>
        <p className="text-sm text-foreground/60">
          Contas bancárias cadastradas e controle de entrega de extrato da competência atual
          ({competenciaAtual.split("-").reverse().join("/")}).
        </p>
      </div>

      <BuscaRapidaEmpresa
        empresas={empresas.map((e) => ({ id: e.id, legal_name: e.legal_name, trade_name: e.trade_name }))}
        basePath="/extratos/empresas"
        placeholder="Buscar empresa e acessar os extratos..."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Empresas cadastradas</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{empresas.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Com conta bancária cadastrada</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{comConta.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-foreground/50">Com extrato pendente este mês</div>
          <div className="mt-1 text-lg font-semibold text-warning">{resumoPorEmpresa.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-3 text-sm font-semibold text-foreground/70">
          Extrato pendente este mês
        </div>
        {resumoPorEmpresa.length === 0 ? (
          <div className="p-6 text-center text-sm text-foreground/50">
            Todas as contas já entregaram o extrato deste mês.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {resumoPorEmpresa.map(({ empresa, totalContas, entregues }) => (
              <Link
                key={empresa.id}
                href={`/extratos/empresas/${empresa.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-warning/10 px-2 py-1 text-xs font-medium text-warning">
                  {entregues}/{totalContas} contas entregues
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm font-semibold text-foreground/70">Todas as empresas</div>
          <form className="flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Buscar por nome..." className="w-56" />
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
            {q && (
              <Link href="/extratos">
                <Button type="button" variant="ghost">
                  Limpar
                </Button>
              </Link>
            )}
          </form>
        </div>
        <div className="max-h-[32rem] divide-y divide-border overflow-y-auto">
          {empresasFiltradas.map((empresa) => {
            const contasAtivas = (empresa.extrato_contas_bancarias ?? []).filter((c) => c.ativo);
            return (
              <Link
                key={empresa.id}
                href={`/extratos/empresas/${empresa.id}`}
                className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {empresa.trade_name || empresa.legal_name}
                  </div>
                  <div className="truncate text-xs text-foreground/50">{empresa.legal_name}</div>
                </div>
                <span className="shrink-0 text-xs text-foreground/50">
                  {contasAtivas.length} conta(s)
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
