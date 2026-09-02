import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { ConsultarSituacaoFiscalLoteButton } from "./ConsultarSituacaoFiscalLoteButton";
import { BaixarRelatoriosSituacaoFiscalLoteButton } from "./BaixarRelatoriosSituacaoFiscalLoteButton";

export const metadata = { title: "Central Situação Fiscal — Painel SOMA" };
export const maxDuration = 300;

// Mesmo TTL do cache no backend (integra-contador/sitfis.py,
// _CACHE_TTL_SEGUNDOS) — só pra decidir o que mostrar como "cache de
// hoje" aqui na tela; quem realmente decide se cobra de novo é o próprio
// serviço integra-contador, isso aqui é só informativo/estimativa.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR");
}

function cacheEhFresco(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < CACHE_TTL_MS;
}

export default async function CentralSituacaoFiscalPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj")
    .not("cnpj", "is", null)
    .order("legal_name");

  const cnpjs = (companies ?? []).map((c) => c.cnpj!);
  const { data: cacheRows } = cnpjs.length
    ? await supabase
        .from("integra_contador_cache")
        .select("contribuinte_cnpj, fetched_at")
        .eq("id_sistema", "SITFIS")
        .eq("id_servico", "RELATORIOSITFIS92")
        .in("contribuinte_cnpj", cnpjs)
    : { data: [] as { contribuinte_cnpj: string; fetched_at: string }[] };

  const cachePorCnpj = new Map((cacheRows ?? []).map((r) => [r.contribuinte_cnpj, r.fetched_at]));

  const linhas = (companies ?? []).map((company) => {
    const fetchedAt = cachePorCnpj.get(company.cnpj!) ?? null;
    const cacheFresco = fetchedAt ? cacheEhFresco(fetchedAt) : false;
    return {
      id: company.id,
      nome: company.trade_name || company.legal_name,
      cnpj: company.cnpj!,
      fetchedAt,
      cacheFresco,
    };
  });

  const semCacheHoje = linhas.filter((l) => !l.cacheFresco).length;
  const todasAsEmpresas = linhas.map((l) => ({ id: l.id, nome: l.nome }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central Situação Fiscal</h1>
        <p className="text-sm text-foreground/60">
          Consulta em lote da Situação Fiscal (Integra Contador) de todas as empresas com CNPJ.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-foreground/50">
            Consultar de novo no mesmo dia não gasta chamada nova — vem do cache automaticamente.
            {semCacheHoje > 0
              ? ` ${semCacheHoje} empresa(s) sem cache das últimas 24h vão gerar chamada nova (paga) ao Integra Contador.`
              : " Todas já têm cache das últimas 24h — rodar de novo agora não deve gerar chamada paga."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ConsultarSituacaoFiscalLoteButton empresas={todasAsEmpresas} semCacheHoje={semCacheHoje} />
            <BaixarRelatoriosSituacaoFiscalLoteButton empresas={todasAsEmpresas} />
          </div>
        </div>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">Nenhuma empresa com CNPJ cadastrado.</Alert>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-foreground/50">
                <th className="border-b border-border px-3 py-2 text-left">Nome</th>
                <th className="border-b border-border px-3 py-2 text-left">CNPJ</th>
                <th className="border-b border-border px-3 py-2 text-left">Última consulta</th>
                <th className="border-b border-border px-3 py-2 text-right">Relatório</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((linha) => (
                <tr key={linha.id}>
                  <td className="whitespace-nowrap px-3 py-2">{linha.nome}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-foreground/60">{linha.cnpj}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {linha.fetchedAt ? (
                      <>
                        {formatarDataHora(linha.fetchedAt)}
                        {linha.cacheFresco && (
                          <span className="ml-2 rounded bg-success-soft px-1.5 py-0.5 text-[10px] font-medium text-success">
                            cache de hoje
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-foreground/40">nunca consultada</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {linha.fetchedAt && (
                      <a
                        href={`/admin/empresas/${linha.id}/integra-contador/situacao-fiscal/historico`}
                        target="_blank"
                        className="font-medium text-brand hover:underline"
                      >
                        Ver PDF
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
