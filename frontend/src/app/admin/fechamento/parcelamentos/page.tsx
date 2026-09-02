import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { MODALIDADES_PARCELAMENTO, modalidadePorId } from "@/lib/parcelamento-modalidades";
import { VerificarParcelamentosLoteButton } from "./VerificarParcelamentosLoteButton";
import { ParcelamentosTable, type LinhaParcelamento } from "./ParcelamentosTable";

export const metadata = { title: "Central de Parcelamentos — Painel SOMA" };
export const maxDuration = 300;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function cacheEhFresco(fetchedAt: string): boolean {
  return Date.now() - new Date(fetchedAt).getTime() < CACHE_TTL_MS;
}

export default async function CentralParcelamentosPage(props: PageProps<"/admin/fechamento/parcelamentos">) {
  const searchParams = await props.searchParams;
  const modalidadeParam = typeof searchParams.modalidade === "string" ? searchParams.modalidade : undefined;
  const modalidade = modalidadePorId(modalidadeParam ?? "parcsn");

  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trade_name, cnpj")
    .eq("tax_regime", "SIMPLES_NACIONAL")
    .not("cnpj", "is", null)
    .order("legal_name");

  const empresasPorId = new Map((companies ?? []).map((c) => [c.id, c]));
  const cnpjs = (companies ?? []).map((c) => c.cnpj!);

  const [{ data: cacheRows }, { data: parcelamentos }] = await Promise.all([
    cnpjs.length
      ? supabase
          .from("integra_contador_cache")
          .select("contribuinte_cnpj, fetched_at")
          .eq("id_sistema", modalidade.idSistema)
          .eq("id_servico", modalidade.idServicoListar)
          .in("contribuinte_cnpj", cnpjs)
      : Promise.resolve({ data: [] as { contribuinte_cnpj: string; fetched_at: string }[] }),
    supabase
      .from("integra_contador_parcelamentos_sn")
      .select(
        "company_id, numero_parcelamento, situacao, parcela_atual, parcelas_total, parcelas_em_atraso, checked_at",
      )
      .eq("modalidade", modalidade.id)
      .in("company_id", (companies ?? []).map((c) => c.id)),
  ]);

  const cachePorCnpj = new Map((cacheRows ?? []).map((r) => [r.contribuinte_cnpj, r.fetched_at]));
  const semCacheHoje = cnpjs.filter((cnpj) => {
    const fetchedAt = cachePorCnpj.get(cnpj);
    return !fetchedAt || !cacheEhFresco(fetchedAt);
  }).length;

  const linhas: LinhaParcelamento[] = (parcelamentos ?? []).flatMap((p) => {
    const empresa = empresasPorId.get(p.company_id);
    if (!empresa) return [];
    return [
      {
        companyId: p.company_id,
        nome: empresa.trade_name || empresa.legal_name,
        cnpj: empresa.cnpj!,
        numeroParcelamento: p.numero_parcelamento,
        situacao: p.situacao,
        parcelaAtual: p.parcela_atual,
        parcelasTotal: p.parcelas_total,
        parcelasEmAtraso: p.parcelas_em_atraso,
        checkedAt: p.checked_at,
      },
    ];
  });

  const todasAsEmpresas = (companies ?? []).map((c) => ({ id: c.id, nome: c.trade_name || c.legal_name }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Central de Parcelamentos</h1>
        <p className="text-sm text-foreground/60">
          Parcelamentos encontrados nas empresas do Simples Nacional — quem não tem parcelamento
          numa modalidade não aparece na tabela dela.{" "}
          <Link href="/admin/fechamento" className="underline">
            Voltar pro Fechamento
          </Link>
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {MODALIDADES_PARCELAMENTO.map((m) => (
          <Link
            key={m.id}
            href={`/admin/fechamento/parcelamentos?modalidade=${m.id}`}
            className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
              m.id === modalidade.id
                ? "border-b-2 border-brand text-brand"
                : "text-foreground/50 hover:text-foreground"
            }`}
          >
            {m.label}
          </Link>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-foreground/50">
            Verificar de novo no mesmo dia não gasta chamada nova — vem do cache automaticamente.
            {semCacheHoje > 0
              ? ` ${semCacheHoje} empresa(s) sem cache das últimas 24h vão gerar chamada nova (paga) ao Integra Contador.`
              : " Todas já têm cache das últimas 24h — rodar de novo agora não deve gerar chamada paga."}
          </p>
          <VerificarParcelamentosLoteButton
            modalidade={modalidade.id}
            modalidadeLabel={modalidade.label}
            empresas={todasAsEmpresas}
            semCacheHoje={semCacheHoje}
          />
        </div>
      </Card>

      {linhas.length === 0 ? (
        <Alert tone="warning">
          Nenhum parcelamento de {modalidade.label} encontrado ainda — clique em &quot;Verificar
          {" "}{modalidade.label} de todas&quot; pra consultar a Serpro.
        </Alert>
      ) : (
        <ParcelamentosTable linhas={linhas} modalidade={modalidade.id} />
      )}
    </div>
  );
}
