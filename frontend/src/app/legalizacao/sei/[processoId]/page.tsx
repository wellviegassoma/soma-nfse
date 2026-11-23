import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SeletorEmpresa } from "@/components/SeletorEmpresa";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  vincularProcessoSei,
  registrarAnaliseSei,
  comentarSei,
  excluirComentarioSei,
  arquivarProcessoSei,
  desarquivarProcessoSei,
  atualizarSituacaoManualSei,
  lancarAndamentoManualSei,
  excluirAndamentoManualSei,
  excluirAnexoManualSei,
} from "@/lib/actions/sei";
import { AnexarDocumentoManual } from "./AnexarDocumentoManual";
import {
  BOLA_LABELS,
  MOTIVOS_ARQUIVAMENTO,
  SITUACAO_LABELS,
  VINCULO_LABELS,
  andamentoRotineiro,
  diasDesde,
  formatarDocumento,
  precisaAnalise,
  type SeiBola,
  type SeiSituacao,
  type VinculoOrigem,
} from "@/lib/sei-labels";
import { AnalisarBadge, BolaBadge, OrigemBadge, SituacaoBadge, dataBr, dataHoraBr, diaBr } from "../situacao";

type Autor = { full_name: string } | null;
const nomeAutor = (a: unknown) => (a as Autor)?.full_name ?? "alguém";

const hojeSp = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

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
    .select("*, empresa:companies(id, legal_name, trade_name, codigo_cliente, ativa)")
    .eq("id", processoId)
    .maybeSingle();
  if (!p) notFound();

  const [
    { data: andamentos },
    { data: documentos },
    { data: empresas },
    { data: analises },
    { data: comentarios },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("sei_andamentos")
      .select("id, data_hora, unidade, descricao, created_at, manual")
      .eq("processo_id", processoId)
      .order("data_hora", { ascending: false })
      .limit(5000),
    supabase
      .from("sei_documentos")
      .select("id, numero_sei, ordem, tipo, data, unidade, nome_arquivo, tamanho, blob_pathname, sem_acesso_em, manual")
      .eq("processo_id", processoId)
      .order("ordem", { ascending: true })
      .limit(5000),
    podeEditar
      ? supabase.from("companies").select("id, legal_name, trade_name, cnpj, codigo_cliente").order("legal_name").limit(5000)
      : Promise.resolve({ data: [] }),
    supabase
      .from("sei_analises")
      .select("id, analisado_ate, bola, comentario, created_at, autor:profiles!sei_analises_criado_por_fkey(full_name)")
      .eq("processo_id", processoId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("sei_comentarios")
      .select("id, texto, created_at, criado_por, autor:profiles!sei_comentarios_criado_por_fkey(full_name)")
      .eq("processo_id", processoId)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.auth.getUser(),
  ]);

  const empresa = p.empresa as {
    id: string;
    legal_name: string;
    trade_name: string | null;
    codigo_cliente: string | null;
    ativa: boolean;
  } | null;
  const aAnalisar = precisaAnalise(p);
  const ultimaAnalise = (analises ?? [])[0] ?? null;
  // Cadastrado à mão e ainda não assumido pela sincronização: situação é manual.
  const manual = !!p.cadastrado_em && !p.sincronizado_em;
  const lista = (andamentos ?? []).filter((a) => mostrarTramitacao || !andamentoRotineiro(a.descricao));
  const ocultos = (andamentos ?? []).length - lista.length;
  const relevantes = (andamentos ?? []).filter((a) => !andamentoRotineiro(a.descricao));
  // Andamento relevante depois da última análise = ninguém viu ainda.
  const naoAnalisado = (a: { data_hora: string; descricao: string }) =>
    !!ultimaAnalise &&
    !andamentoRotineiro(a.descricao) &&
    (!p.ultima_analise_ate || new Date(a.data_hora) > new Date(p.ultima_analise_ate));

  // Linha do tempo: andamentos + comentários + marcas "analisado até aqui".
  // A marca fica no ponto do andamento analisado (acima dele, na ordem desc).
  type Item =
    | { tipo: "andamento"; t: number; ord: number; a: NonNullable<typeof andamentos>[number] }
    | { tipo: "comentario"; t: number; ord: number; c: NonNullable<typeof comentarios>[number] }
    | { tipo: "analise"; t: number; ord: number; an: NonNullable<typeof analises>[number] };
  const itens: Item[] = [
    ...lista.map((a) => ({ tipo: "andamento" as const, t: new Date(a.data_hora).getTime(), ord: 0, a })),
    ...(comentarios ?? []).map((c) => ({ tipo: "comentario" as const, t: new Date(c.created_at).getTime(), ord: 1, c })),
    ...(analises ?? []).map((an) => ({
      tipo: "analise" as const,
      t: new Date(an.analisado_ate ?? an.created_at).getTime(),
      ord: 2,
      an,
    })),
  ].sort((x, y) => y.t - x.t || y.ord - x.ord);

  const dias: { dia: string; itens: Item[] }[] = [];
  for (const it of itens) {
    const dia = diaBr(new Date(it.t).toISOString());
    const ultimo = dias[dias.length - 1];
    if (ultimo?.dia === dia) ultimo.itens.push(it);
    else dias.push({ dia, itens: [it] });
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
          <OrigemBadge origem={p.origem} cadastradoEm={p.cadastrado_em} sincronizadoEm={p.sincronizado_em} />
          {aAnalisar && <AnalisarBadge nunca={!p.ultima_analise_em} />}
          {p.bola && <BolaBadge bola={p.bola as SeiBola} desde={p.bola_desde} />}
        </div>
        <p className="text-sm text-foreground/60">
          {p.tipo}
          {p.data_entrada ? ` · entrada em ${dataBr(p.data_entrada)}` : ` · gerado em ${dataBr(p.data_geracao)}`}
          {p.nivel_acesso && ` · ${p.nivel_acesso}`}
          {p.acesso_validade && ` · acesso até ${dataBr(p.acesso_validade)}${p.acesso_expirado ? " (expirado)" : ""}`}
        </p>
        {p.observacao && <p className="mt-1 whitespace-pre-line text-sm text-foreground/70">{p.observacao}</p>}
      </div>

      <Card className={`flex flex-col gap-3 p-4 ${aAnalisar ? "border-danger/40" : ""}`}>
        <div className="text-sm">
          {ultimaAnalise ? (
            <>
              <span className="font-medium">Última análise:</span> {nomeAutor(ultimaAnalise.autor)} em{" "}
              {dataHoraBr(ultimaAnalise.created_at)}
              {ultimaAnalise.analisado_ate && <> — analisado até o andamento de {dataHoraBr(ultimaAnalise.analisado_ate)}</>}
              {" · "}
              <strong>{BOLA_LABELS[ultimaAnalise.bola as SeiBola]}</strong>
              {p.bola_desde && ` há ${diasDesde(p.bola_desde)} dia(s)`}
              {ultimaAnalise.comentario && (
                <div className="mt-1 whitespace-pre-line text-foreground/70">“{ultimaAnalise.comentario}”</div>
              )}
              {aAnalisar && <div className="mt-1 text-danger">Chegou andamento depois dessa análise.</div>}
            </>
          ) : (
            <span className="text-danger">Ninguém registrou análise deste processo ainda.</span>
          )}
        </div>
        {podeEditar && (
          <form action={registrarAnaliseSei} className="flex flex-col gap-2 border-t border-border pt-3">
            <input type="hidden" name="processoId" value={p.id} />
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground/60">Analisei até o andamento</label>
                <Select name="ate" defaultValue={relevantes[0]?.data_hora ?? ""} className="h-9 w-80 text-xs">
                  {relevantes.length === 0 && <option value="">(sem andamentos)</option>}
                  {relevantes.slice(0, 20).map((a) => (
                    <option key={a.id} value={a.data_hora}>
                      {dataHoraBr(a.data_hora)} — {a.descricao.slice(0, 60)}
                      {a.descricao.length > 60 ? "…" : ""}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-foreground/60">Com quem está a bola</label>
                <Select name="bola" defaultValue={p.bola ?? "PREFEITURA"} className="h-9 w-52 text-xs">
                  {(Object.keys(BOLA_LABELS) as SeiBola[]).map((b) => (
                    <option key={b} value={b}>
                      {BOLA_LABELS[b]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Input
              name="comentario"
              maxLength={2000}
              placeholder="O que foi visto / o que estamos esperando (opcional)"
              className="h-9 text-sm"
            />
            <div>
              <Button type="submit" className="h-9">
                Registrar análise
              </Button>
            </div>
          </form>
        )}
      </Card>

      {manual && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
          <div className="text-foreground/70">
            Processo cadastrado à mão em {dataHoraBr(p.cadastrado_em)}
            {p.origem === "FISICO"
              ? " (protocolo físico/fora do SEI): a situação e os andamentos são atualizados aqui."
              : " (SEI sem acesso da SOMA): se a SOMA ganhar acesso, a sincronização assume e atualiza sozinha."}
          </div>
          {podeEditar && (
            <form action={atualizarSituacaoManualSei} className="flex items-center gap-2">
              <input type="hidden" name="processoId" value={p.id} />
              <Select name="situacao" defaultValue={p.situacao} className="h-9 w-48 text-sm">
                {(Object.keys(SITUACAO_LABELS) as SeiSituacao[]).map((s) => (
                  <option key={s} value={s}>
                    {SITUACAO_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary" className="h-9">
                Atualizar situação
              </Button>
            </form>
          )}
        </Card>
      )}

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

      {p.arquivado_em ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-warning bg-warning/5 p-4 text-sm">
          <div>
            <span className="font-medium">Arquivado</span> em {dataHoraBr(p.arquivado_em)}
            {p.motivo_arquivamento && ` — ${p.motivo_arquivamento}`}. A extensão não abre mais este processo no SEI.
          </div>
          {podeEditar && (
            <form action={desarquivarProcessoSei}>
              <input type="hidden" name="processoId" value={p.id} />
              <Button type="submit" variant="secondary">Desarquivar</Button>
            </form>
          )}
        </Card>
      ) : (
        podeEditar && (
          <details className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <summary className="cursor-pointer text-foreground/70">
              Arquivar processo{empresa && empresa.ativa === false ? " (cliente inativo)" : ""}
            </summary>
            <form action={arquivarProcessoSei} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="processoId" value={p.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/60">Motivo</label>
                <Select name="motivo" defaultValue={empresa && empresa.ativa === false ? "Cliente saiu da SOMA" : ""} required className="w-64">
                  <option value="" disabled>
                    Escolha…
                  </option>
                  {MOTIVOS_ARQUIVAMENTO.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex min-w-60 flex-1 flex-col gap-1.5">
                <label className="text-xs font-medium text-foreground/60">Observação (opcional)</label>
                <Input name="observacao" maxLength={500} />
              </div>
              <Button type="submit" variant="secondary">Arquivar</Button>
            </form>
            <p className="mt-2 text-xs text-foreground/50">
              Some da lista e das novidades, e a extensão deixa de abrir no SEI. O que já foi baixado fica guardado.
            </p>
          </details>
        )
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Linha do tempo</h2>
            <Link
              href={mostrarTramitacao ? `/legalizacao/sei/${p.id}` : `/legalizacao/sei/${p.id}?tramitacao=1`}
              className="text-xs text-foreground/60 hover:text-foreground"
            >
              {mostrarTramitacao ? "Esconder tramitação" : `Mostrar tramitação (${ocultos})`}
            </Link>
          </div>
          {podeEditar && (
            <details className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" open={manual && (andamentos ?? []).length <= 1}>
              <summary className="cursor-pointer text-foreground/70">+ Lançar andamento à mão</summary>
              <form action={lancarAndamentoManualSei} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="processoId" value={p.id} />
                <div className="flex flex-wrap gap-2">
                  <Input type="date" name="data" required defaultValue={hojeSp()} className="h-9 w-40" />
                  <Input type="time" name="hora" className="h-9 w-28" />
                </div>
                <textarea
                  name="descricao"
                  required
                  rows={2}
                  maxLength={5000}
                  placeholder="Ex.: fiscal informou por telefone que falta o certificado do CRO."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
                />
                <div>
                  <Button type="submit" variant="secondary" className="h-9">
                    Lançar
                  </Button>
                </div>
              </form>
            </details>
          )}
          {podeEditar && (
            <form action={comentarSei} className="flex gap-2">
              <input type="hidden" name="processoId" value={p.id} />
              <Input
                name="texto"
                required
                maxLength={5000}
                placeholder="Comentário interno da equipe (ex.: liguei, o fiscal vai semana que vem)"
                className="h-9 flex-1 text-sm"
              />
              <Button type="submit" variant="secondary" className="h-9">
                Comentar
              </Button>
            </form>
          )}
          {dias.map((d) => (
            <div key={d.dia} className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-foreground/50">{d.dia}</div>
              {d.itens.map((it) => {
                if (it.tipo === "analise") {
                  const an = it.an;
                  return (
                    <div key={`an-${an.id}`} className="flex items-center gap-2 text-xs text-brand">
                      <div className="h-px flex-1 bg-brand/40" />
                      <span className="max-w-[80%] text-center">
                        Analisado por {nomeAutor(an.autor)} em {dataHoraBr(an.created_at)} ·{" "}
                        {BOLA_LABELS[an.bola as SeiBola]}
                        {an.comentario && ` — “${an.comentario}”`}
                      </span>
                      <div className="h-px flex-1 bg-brand/40" />
                    </div>
                  );
                }
                if (it.tipo === "comentario") {
                  const c = it.c;
                  return (
                    <div key={`c-${c.id}`} className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2 text-xs text-foreground/50">
                        <span>
                          {horaBr(c.created_at)} · comentário de {nomeAutor(c.autor)}
                        </span>
                        {podeEditar && c.criado_por === user?.id && (
                          <form action={excluirComentarioSei}>
                            <input type="hidden" name="comentarioId" value={c.id} />
                            <button type="submit" className="text-foreground/40 hover:text-danger">
                              excluir
                            </button>
                          </form>
                        )}
                      </div>
                      <div className="whitespace-pre-line text-sm">{c.texto}</div>
                    </div>
                  );
                }
                const a = it.a;
                const rotina = andamentoRotineiro(a.descricao);
                const novo = naoAnalisado(a);
                return (
                  <div
                    key={a.id}
                    className={`rounded-lg border px-3 py-2 ${rotina ? "border-dashed border-border text-foreground/50" : destaque(a.descricao)} ${novo ? "ring-2 ring-danger/40" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-foreground/50">
                      <span>
                        {horaBr(a.data_hora)} · {a.unidade}
                        {a.manual && <span className="ml-1 rounded bg-brand/10 px-1 text-brand">lançado à mão</span>}
                        {novo && <span className="ml-1 rounded bg-danger/10 px-1 font-semibold text-danger">não analisado</span>}
                      </span>
                      {a.manual && podeEditar && (
                        <form action={excluirAndamentoManualSei}>
                          <input type="hidden" name="andamentoId" value={a.id} />
                          <button type="submit" className="text-foreground/40 hover:text-danger">
                            excluir
                          </button>
                        </form>
                      )}
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
                    {d.manual ? "anexado à mão" : d.numero_sei} · {dataBr(d.data)} · {d.unidade}
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
                    {d.manual && podeEditar && (
                      <form action={excluirAnexoManualSei}>
                        <input type="hidden" name="documentoId" value={d.id} />
                        <button type="submit" className="text-foreground/40 hover:text-danger">
                          excluir
                        </button>
                      </form>
                    )}
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
          {podeEditar && <AnexarDocumentoManual processoId={p.id} />}
          <p className="text-xs text-foreground/50">
            {p.sincronizado_em ? `Sincronizado com o SEI em ${dataHoraBr(p.sincronizado_em)}.` : "Ainda não sincronizado com o SEI."}
          </p>
        </div>
      </div>
    </div>
  );
}
