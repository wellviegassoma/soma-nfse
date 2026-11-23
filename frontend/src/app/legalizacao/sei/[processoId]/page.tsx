import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SeletorEmpresa } from "@/components/SeletorEmpresa";
import { vincularProcessoSei, marcarSeiVisto } from "@/lib/actions/sei";
import { VINCULO_LABELS, andamentoRotineiro, formatarDocumento, type SeiSituacao, type VinculoOrigem } from "@/lib/sei-labels";
import { NovidadeBadge, SituacaoBadge, dataBr, dataHoraBr, diaBr, temNovidade } from "../situacao";

export const metadata = { title: "Processo SEI — Legalização" };

export default async function SeiProcessoPage(props: PageProps<"/legalizacao/sei/[processoId]">) {
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");
  const { processoId } = await props.params;
  const sp = await props.searchParams;
  const mostrarTramitacao = sp.tramitacao === "1";

  const supabase = await createClient();
  const { data: p } = await supabase
    .from("sei_processos")
    .select("*, empresa:companies(id, legal_name, trade_name, codigo_cliente)")
    .eq("id", processoId)
    .maybeSingle();
  if (!p) notFound();

  const [{ data: andamentos }, { data: documentos }, { data: empresas }] = await Promise.all([
    supabase
      .from("sei_andamentos")
      .select("id, data_hora, unidade, descricao, created_at")
      .eq("processo_id", processoId)
      .order("data_hora", { ascending: false })
      .limit(5000),
    supabase
      .from("sei_documentos")
      .select("id, numero_sei, ordem, tipo, data, unidade, nome_arquivo, tamanho, blob_pathname, sem_acesso_em")
      .eq("processo_id", processoId)
      .order("ordem", { ascending: true })
      .limit(5000),
    podeEditar
      ? supabase.from("companies").select("id, legal_name, trade_name, cnpj, codigo_cliente").order("legal_name").limit(5000)
      : Promise.resolve({ data: [] }),
  ]);

  const empresa = p.empresa as { id: string; legal_name: string; trade_name: string | null; codigo_cliente: string | null } | null;
  const novidade = temNovidade(p);
  const lista = (andamentos ?? []).filter((a) => mostrarTramitacao || !andamentoRotineiro(a.descricao));
  const ocultos = (andamentos ?? []).length - lista.length;

  // Agrupa por dia (já em ordem decrescente).
  const dias: { dia: string; itens: typeof lista }[] = [];
  for (const a of lista) {
    const dia = diaBr(a.data_hora);
    const ultimo = dias[dias.length - 1];
    if (ultimo?.dia === dia) ultimo.itens.push(a);
    else dias.push({ dia, itens: [a] });
  }
  const horaBr = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const destaque = (t: string) =>
    /aguardando (o )?cumprimento|termo de intima|exig[êe]ncia|dever[áa] (anexar|apresentar)/i.test(t)
      ? "border-warning bg-warning/5"
      : /EXPEDIDA E ASSINADA|licen[çc]a sanit[áa]ria.{0,40}(expedida|emitida)/i.test(t)
        ? "border-success bg-success/5"
        : "border-border";
  const tamanho = (n: number | null) => (n == null ? "" : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/legalizacao/sei" className="text-sm text-foreground/60 hover:text-foreground">
          ← Processos do SEI
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">{p.numero}</h1>
          <SituacaoBadge situacao={p.situacao as SeiSituacao} />
          {novidade && <NovidadeBadge />}
          {novidade && (
            <form action={marcarSeiVisto}>
              <input type="hidden" name="processoId" value={p.id} />
              <Button type="submit" variant="ghost" className="h-8 px-2 text-xs">
                Marcar como visto
              </Button>
            </form>
          )}
        </div>
        <p className="text-sm text-foreground/60">
          {p.tipo} · gerado em {dataBr(p.data_geracao)} · {p.nivel_acesso}
          {p.acesso_validade && ` · acesso até ${dataBr(p.acesso_validade)}${p.acesso_expirado ? " (expirado)" : ""}`}
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4">
        <div className="text-sm">
          <span className="font-medium">Cliente: </span>
          {empresa ? (
            <Link href={`/legalizacao/empresas/${empresa.id}`} className="text-brand hover:underline">
              {empresa.codigo_cliente && `#${empresa.codigo_cliente} `}
              {empresa.trade_name || empresa.legal_name}
            </Link>
          ) : (
            <span className="text-warning">sem cliente vinculado</span>
          )}
          {p.vinculo_origem && (
            <span className="text-foreground/50"> — {VINCULO_LABELS[p.vinculo_origem as VinculoOrigem]}</span>
          )}
        </div>
        <div className="grid gap-1 text-xs text-foreground/60 sm:grid-cols-2">
          <div>
            <span className="font-medium">Lido no requerimento: </span>
            {[p.requerente_nome, formatarDocumento(p.requerente_documento), p.requerente_im && `IM ${p.requerente_im}`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>
          <div>
            <span className="font-medium">Interessados no SEI: </span>
            {(p.interessados as string[]).join(" · ") || "—"}
          </div>
        </div>
        {podeEditar && (
          <form action={vincularProcessoSei} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="processoId" value={p.id} />
            <div className="min-w-72 flex-1">
              <SeletorEmpresa name="companyId" empresas={empresas ?? []} defaultValue={empresa} />
            </div>
            <Button type="submit" variant="secondary">
              {empresa ? "Trocar cliente" : "Vincular cliente"}
            </Button>
          </form>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Andamentos</h2>
            <Link
              href={mostrarTramitacao ? `/legalizacao/sei/${p.id}` : `/legalizacao/sei/${p.id}?tramitacao=1`}
              className="text-xs text-foreground/60 hover:text-foreground"
            >
              {mostrarTramitacao ? "Esconder tramitação" : `Mostrar tramitação (${ocultos})`}
            </Link>
          </div>
          {dias.map((d) => (
            <div key={d.dia} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-foreground/50">{d.dia}</div>
              {d.itens.map((a) => {
                const rotina = andamentoRotineiro(a.descricao);
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border px-3 py-2 ${rotina ? "border-dashed border-border text-foreground/50" : destaque(a.descricao)}`}
                  >
                    <div className="text-xs text-foreground/50">
                      {horaBr(a.data_hora)} · {a.unidade}
                    </div>
                    <div className={`whitespace-pre-line ${rotina ? "text-xs" : "text-sm"}`}>{a.descricao}</div>
                  </div>
                );
              })}
            </div>
          ))}
          {dias.length === 0 && <p className="text-sm text-foreground/50">Sem andamentos.</p>}
        </div>

        <div className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Documentos ({documentos?.length ?? 0})</h2>
          <Card className="divide-y divide-border p-0">
            {(documentos ?? []).map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate" title={d.tipo ?? ""}>
                    {d.tipo || "Documento"}
                  </div>
                  <div className="text-xs text-foreground/50">
                    {d.numero_sei} · {dataBr(d.data)} · {d.unidade}
                    {d.tamanho != null && ` · ${tamanho(d.tamanho)}`}
                  </div>
                </div>
                {d.blob_pathname ? (
                  <div className="flex shrink-0 gap-2 text-xs">
                    <a href={`/api/sei/documentos/${d.id}`} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      abrir
                    </a>
                    <a href={`/api/sei/documentos/${d.id}?download=1`} className="text-foreground/60 hover:underline">
                      baixar
                    </a>
                  </div>
                ) : d.sem_acesso_em ? (
                  <span
                    className="shrink-0 text-xs text-warning"
                    title="O acesso externo da SOMA neste processo não permite abrir este documento no SEI. Para baixar, é preciso pedir acesso integral ao processo."
                  >
                    sem acesso no SEI
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-foreground/40">não baixado</span>
                )}
              </div>
            ))}
          </Card>
          <p className="text-xs text-foreground/50">Sincronizado em {dataHoraBr(p.sincronizado_em)}.</p>
        </div>
      </div>
    </div>
  );
}
