import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarCnpj, formatarData, formatarDataHora } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { hojeBrasilia } from "@/lib/competencia";
import { decodificarEntidades, ehIntimacao, ORIGEM, STATUS_LABEL, type StatusTratamento } from "@/lib/caixa-postal-core";
import { empresasParaLer } from "@/lib/caixa-postal";
import { TratamentoMensagem } from "./TratamentoMensagem";
import { ConteudoMensagem } from "./ConteudoMensagem";
import { LerCaixaPostalButton } from "./LerCaixaPostalButton";

export const metadata = { title: "Intimações — Painel SOMA" };
export const maxDuration = 300;

type Filtro = "abertas" | "resolvidas" | "todas";

type Linha = {
  id: string;
  company_id: string;
  assunto: string;
  relevante: boolean;
  tipo_origem: number | null;
  descricao_origem: string | null;
  enviada_em: string | null;
  lida_em: string | null;
  ciencia_em: string | null;
  vista_em: string;
  status: StatusTratamento;
  responsavel_id: string | null;
  observacao: string | null;
  tratamento_em: string | null;
  tratamento_por: string | null;
  isn: string;
  corpo: string | null;
  corpo_lido_em: string | null;
  corpo_lido_por: string | null;
};

const PRAZO_CIENCIA_TACITA_DIAS = 15; // Decreto 70.235/72, art. 23, § 2º, III, "a"

/** "YYYY-MM-DD" (coluna date) → dd/mm/aaaa sem passar por fuso (senão vira o dia anterior). */
function dataSemHora(d: string): string {
  const [a, m, dia] = d.slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}

function cienciaTacita(enviadaEm: string): string {
  const d = new Date(enviadaEm);
  d.setDate(d.getDate() + PRAZO_CIENCIA_TACITA_DIAS);
  return d.toISOString();
}

// Última rodada de cada rotina (vercel.json, toda segunda): quando foi, quantas
// empresas deram certo nas 24h dela e quantas falharam. Mais de 8 dias sem
// rodar = a rotina parou, e a tela avisa em vermelho.
function resumoRotina(linhas: { quando: string; ok: boolean }[], diasLimite = 8) {
  const ultima = linhas.filter((l) => l.ok).map((l) => l.quando).sort().at(-1) ?? null;
  if (!ultima) return { ultima: null, ok: 0, falhas: linhas.filter((l) => !l.ok).length, atrasada: true };
  const inicio = new Date(ultima).getTime() - 24 * 3600_000;
  const daRodada = linhas.filter((l) => new Date(l.quando).getTime() >= inicio);
  return {
    ultima,
    ok: daRodada.filter((l) => l.ok).length,
    falhas: daRodada.filter((l) => !l.ok).length,
    atrasada: Date.now() - new Date(ultima).getTime() > diasLimite * 24 * 3600_000,
  };
}

/** Próxima segunda às 7h (Brasília), horário do primeiro cron do vercel.json → dd/mm/aaaa. */
function proximaSegundaBr(): string {
  const br = new Date(Date.now() - 3 * 3600_000); // "relógio" de Brasília em campos UTC
  const dow = br.getUTCDay();
  const dias = dow === 1 && br.getUTCHours() < 7 ? 0 : (8 - dow) % 7 || 7;
  const d = new Date(Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() + dias));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export default async function IntimacoesPage({ searchParams }: PageProps<"/admin/intimacoes">) {
  const sp = await searchParams;
  const hoje = hojeBrasilia();
  const filtro: Filtro = sp.filtro === "resolvidas" || sp.filtro === "todas" ? sp.filtro : "abertas";
  const soDestaque = sp.destaque === "1";
  const empresaFiltro = typeof sp.empresa === "string" ? sp.empresa : null;

  const supabase = await createClient();
  const admin = createAdminClient();

  let consulta = supabase
    .from("caixa_postal_mensagens")
    .select(
      "id, company_id, isn, assunto, relevante, tipo_origem, descricao_origem, enviada_em, lida_em, ciencia_em, vista_em, status, responsavel_id, observacao, tratamento_em, tratamento_por, corpo, corpo_lido_em, corpo_lido_por",
    )
    .order("enviada_em", { ascending: false, nullsFirst: false })
    .limit(filtro === "abertas" ? 1000 : 400);
  if (filtro === "abertas") consulta = consulta.neq("status", "resolvida");
  if (filtro === "resolvidas") consulta = consulta.eq("status", "resolvida");
  if (empresaFiltro) consulta = consulta.eq("company_id", empresaFiltro);

  const [{ data: leiturasDec }, { data: verificacoesCnpj }] = await Promise.all([
    supabase.from("dec_rj_leituras").select("lida_em, ok, ativo"),
    supabase.from("cnpj_situacoes").select("verificado_em, ok"),
  ]);
  const { data: situacoesForaDeAtiva } = await supabase
    .from("cnpj_situacoes")
    .select("company_id, situacao, data_situacao, motivo, situacao_anterior, mudou_em, verificado_em")
    .eq("ok", true)
    .neq("situacao", "ATIVA");
  const [{ data: mensagensBrutas, error: erroMsgs }, empresas, { data: leituras }, { data: contagens }, { data: globais }] =
    await Promise.all([
      consulta,
      empresasParaLer(supabase),
      supabase.from("caixa_postal_leituras").select("company_id, lida_em, ok, erro"),
      supabase.from("caixa_postal_mensagens").select("status, relevante, assunto").neq("status", "resolvida"),
      admin.from("usuario_permissoes").select("user_id").is("company_id", null),
    ]);

  const idsEquipe = [...new Set((globais ?? []).map((g) => g.user_id as string))];
  const { data: perfis } = idsEquipe.length
    ? await admin.from("profiles").select("id, full_name, email, ativo").in("id", idsEquipe)
    : { data: [] as { id: string; full_name: string | null; email: string | null; ativo: boolean | null }[] };
  const nomePorId = new Map((perfis ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
  const equipe = (perfis ?? [])
    .filter((p) => p.ativo !== false)
    .map((p) => ({ id: p.id, nome: p.full_name || p.email || p.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.nome]));
  const cnpjEmpresa = new Map(empresas.map((e) => [e.id, formatarCnpj(e.cnpj)]));
  const leituraPorEmpresa = new Map((leituras ?? []).map((l) => [l.company_id as string, l]));

  const destaque = (m: { relevante: boolean; assunto: string }) => m.relevante || ehIntimacao(m.assunto);
  const ordemStatus: Record<StatusTratamento, number> = { nova: 0, em_tratamento: 1, resolvida: 2 };
  const mensagens = ((mensagensBrutas ?? []) as Linha[])
    .map((m) => ({ ...m, assunto: decodificarEntidades(m.assunto) }))
    .filter((m) => !soDestaque || destaque(m))
    .sort(
      (a, b) =>
        ordemStatus[a.status] - ordemStatus[b.status] ||
        // Alerta de CNPJ fora de ATIVA (situacao-cnpj.ts) acima de tudo.
        Number(b.isn.startsWith("CNPJ:")) - Number(a.isn.startsWith("CNPJ:")) ||
        Number(destaque(b)) - Number(destaque(a)) ||
        (b.enviada_em ?? "").localeCompare(a.enviada_em ?? ""),
    );

  const abertas = contagens ?? [];
  const nNovas = abertas.filter((m) => m.status === "nova").length;
  const nDestaqueAbertas = abertas.filter((m) => destaque(m as { relevante: boolean; assunto: string })).length;
  const nEmTratamento = abertas.filter((m) => m.status === "em_tratamento").length;
  const comFalha = empresas.filter((e) => leituraPorEmpresa.get(e.id)?.ok === false);
  const nuncaLidas = empresas.filter((e) => !leituraPorEmpresa.has(e.id));
  const rotinas = [
    {
      nome: "Caixa Postal do e-CAC",
      fonte: "Integra Contador",
      ...resumoRotina((leituras ?? []).map((l) => ({ quando: l.lida_em as string, ok: !!l.ok }))),
    },
    {
      nome: "DeC da SEFAZ-RJ",
      fonte: "Infosimples",
      ...resumoRotina(
        (leiturasDec ?? []).filter((l) => l.ativo !== false || l.ok).map((l) => ({ quando: l.lida_em as string, ok: !!l.ok })),
      ),
    },
    {
      nome: "Situação do CNPJ",
      fonte: "BrasilAPI",
      ...resumoRotina(
        (verificacoesCnpj ?? []).map((v) => ({ quando: v.verificado_em as string, ok: !!v.ok })),
        2, // roda todo dia
      ),
    },
  ];
  const proximaSegunda = proximaSegundaBr();

  const href = (mud: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const base = { filtro, destaque: soDestaque ? "1" : null, empresa: empresaFiltro, ...mud };
    for (const [k, v] of Object.entries(base)) if (v && !(k === "filtro" && v === "abertas")) q.set(k, v);
    const s = q.toString();
    return `/admin/intimacoes${s ? `?${s}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Intimações e mensagens oficiais</h1>
          <p className="text-sm text-foreground/60">
            Caixa Postal do e-CAC e DeC da SEFAZ-RJ de toda a carteira lidos sozinhos toda segunda-feira (próxima:{" "}
            {proximaSegunda}, a partir das 7h); situação do CNPJ todo dia às 8h30.
          </p>
        </div>
        <LerCaixaPostalButton
          empresas={empresas.filter((e) => !empresaFiltro || e.id === empresaFiltro).map((e) => ({ id: e.id, nome: e.nome }))}
          rotulo={empresaFiltro ? "Ler esta empresa agora" : "Ler todas agora"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {rotinas.map((r) => (
          <div
            key={r.nome}
            className={cn(
              "rounded-xl border p-3 text-sm",
              r.atrasada ? "border-danger bg-danger-soft text-danger" : "border-border bg-surface",
            )}
          >
            <p className="font-semibold text-foreground">
              {r.nome} <span className="font-normal text-foreground/50">· {r.fonte}</span>
            </p>
            {r.ultima ? (
              <p className={cn("mt-0.5", r.atrasada ? "font-semibold" : "text-foreground/70")}>
                Última leitura: {formatarDataHora(r.ultima)}
                {r.atrasada && " (atrasada: a rotina pode ter parado)"}
              </p>
            ) : (
              <p className="mt-0.5 font-semibold">Ainda não rodou.</p>
            )}
            <p className="text-xs text-foreground/50">
              {r.ok} empresa(s) lida(s){r.falhas ? ` · ${r.falhas} com erro` : ""} nessa rodada
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
        <strong>Abrir a mensagem no e-CAC dá ciência da intimação e o prazo começa a contar.</strong> O SOMA lê só a
        lista (assunto, data, relevância, se alguém já abriu), que <strong>não dá ciência</strong>. O botão &quot;Ler conteúdo&quot; traz o texto para cá, mas dá ciência igual ao e-CAC (pede confirmação). Sem abrir, a
        ciência acontece sozinha {PRAZO_CIENCIA_TACITA_DIAS} dias depois do envio. Decida quem vai tratar antes de
        abrir no portal.
      </div>

      {(() => {
        // Empresa ativa no SOMA que não está ATIVA na Receita: alerta máximo.
        const fora = (situacoesForaDeAtiva ?? []).filter((x) => nomeEmpresa.has(x.company_id as string));
        if (!fora.length) return null;
        return (
          <div className="rounded-xl border-2 border-danger bg-danger p-4 text-white shadow-lg">
            <p className="text-base font-bold">
              ALERTA MÁXIMO: {fora.length} empresa(s) da carteira com CNPJ fora de ATIVA na Receita Federal
            </p>
            <p className="mt-0.5 text-xs text-white/85">
              Empresa inapta ou suspensa não emite nota nem tira CND. Verificar no e-CAC e regularizar já. Fonte: BrasilAPI,
              conferida todo dia.
            </p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {fora.map((x) => (
                <li key={x.company_id as string} className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={href({ empresa: x.company_id as string, filtro: "todas" })} className="font-semibold underline">
                    {nomeEmpresa.get(x.company_id as string)}
                  </Link>
                  <span className="font-mono text-white/85">{cnpjEmpresa.get(x.company_id as string)}</span>
                  <span className="rounded bg-white px-1.5 py-0.5 text-xs font-bold text-danger">{x.situacao}</span>
                  {x.data_situacao && <span className="text-xs">desde {dataSemHora(x.data_situacao as string)}</span>}
                  {x.motivo && <span className="text-xs">· {x.motivo}</span>}
                  {x.situacao_anterior && <span className="text-xs">· era {x.situacao_anterior}</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      {erroMsgs && (
        <Alert tone="danger">
          A tabela da Caixa Postal ainda não existe no banco (migration fase_bs pendente): {erroMsgs.message}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Novas, sem ninguém tratando" valor={nNovas} alerta={nNovas > 0} />
        <Indicador titulo="Intimações e relevantes em aberto" valor={nDestaqueAbertas} alerta={nDestaqueAbertas > 0} />
        <Indicador titulo="Em tratamento" valor={nEmTratamento} />
        <Indicador
          titulo="Empresas sem leitura"
          valor={comFalha.length + nuncaLidas.length}
          detalhe={`${comFalha.length} com erro · ${nuncaLidas.length} nunca lidas · ${empresas.length} na carteira`}
          alerta={comFalha.length > 0}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(["abertas", "resolvidas", "todas"] as Filtro[]).map((f) => (
          <Link
            key={f}
            href={href({ filtro: f })}
            className={cn(
              "rounded-full border px-3 py-1",
              filtro === f ? "border-brand bg-brand text-brand-foreground" : "border-border text-foreground/70 hover:bg-surface-muted",
            )}
          >
            {f === "abertas" ? "Em aberto" : f === "resolvidas" ? "Resolvidas" : "Todas"}
          </Link>
        ))}
        <Link
          href={href({ destaque: soDestaque ? null : "1" })}
          className={cn(
            "rounded-full border px-3 py-1",
            soDestaque ? "border-danger bg-danger text-white" : "border-border text-foreground/70 hover:bg-surface-muted",
          )}
        >
          Só intimações e relevantes
        </Link>
        {empresaFiltro && (
          <Link href={href({ empresa: null })} className="rounded-full border border-border px-3 py-1 text-foreground/70">
            {nomeEmpresa.get(empresaFiltro) ?? "Empresa"} ✕
          </Link>
        )}
        <span className="ml-auto text-xs text-foreground/50">{mensagens.length} mensagem(ns)</span>
      </div>

      {mensagens.length === 0 ? (
        <Card className="p-6 text-sm text-foreground/60">
          {filtro === "abertas" ? "Nenhuma mensagem em aberto." : "Nenhuma mensagem neste filtro."}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {mensagens.map((m) => {
            const intim = ehIntimacao(m.assunto);
            const tacita = !m.lida_em && !m.ciencia_em && m.enviada_em ? cienciaTacita(m.enviada_em) : null;
            return (
              <Card
                key={m.id}
                className={cn(
                  "border-l-4 p-4",
                  m.status === "resolvida"
                    ? "border-l-success/60 opacity-80"
                    : intim || m.relevante
                      ? "border-l-danger"
                      : m.status === "nova"
                        ? "border-l-warning"
                        : "border-l-brand",
                )}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Selo status={m.status} />
                      {intim && <span className="rounded bg-danger px-1.5 py-0.5 font-semibold text-white">Intimação/cobrança</span>}
                      {m.relevante && (
                        <span className="rounded bg-danger-soft px-1.5 py-0.5 font-semibold text-danger">Relevante</span>
                      )}
                      <Link href={href({ empresa: m.company_id })} className="font-medium text-foreground hover:underline">
                        {nomeEmpresa.get(m.company_id) ?? "Empresa inativa"}
                      </Link>
                      {cnpjEmpresa.get(m.company_id) && (
                        <span className="font-mono text-foreground/70">{cnpjEmpresa.get(m.company_id)}</span>
                      )}
                      <span className="text-foreground/50">
                        {m.descricao_origem || (m.tipo_origem ? ORIGEM[m.tipo_origem] : "Caixa Postal")}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[15px] font-medium text-foreground">{m.assunto}</p>
                    <p className="mt-1 text-xs text-foreground/60">
                      Enviada em {m.enviada_em ? formatarDataHora(m.enviada_em) : "—"}
                      {" · "}
                      {m.lida_em ? (
                        <span className="font-medium text-warning">
                          {m.corpo_lido_em &&
                          Math.abs(new Date(m.lida_em).getTime() - new Date(m.corpo_lido_em).getTime()) < 5 * 60_000
                            ? `Aberta pelo SOMA em ${formatarDataHora(m.lida_em)}${
                                m.corpo_lido_por ? ` por ${nomePorId.get(m.corpo_lido_por) ?? "—"}` : ""
                              } (já tem ciência)`
                            : `Aberta no ${m.isn.startsWith("DEC:") ? "DeC" : "e-CAC"} em ${formatarDataHora(m.lida_em)} (já tem ciência)`}
                        </span>
                      ) : m.ciencia_em ? (
                        <span className="font-medium text-warning">
                          Ninguém abriu · ciência automática em {dataSemHora(m.ciencia_em)}
                          {m.ciencia_em <= hoje ? " (prazo já corre)" : " (prazo ainda não começou)"}
                        </span>
                      ) : (
                        <>Ninguém abriu ainda · ciência automática em {tacita ? formatarData(tacita) : "—"}</>
                      )}
                      {" · "}No SOMA desde {formatarData(m.vista_em)}
                    </p>
                    {(m.responsavel_id || m.observacao || m.tratamento_em) && (
                      <p className="mt-1.5 text-xs text-foreground/70">
                        {m.responsavel_id && <>Responsável: <strong>{nomePorId.get(m.responsavel_id) ?? "—"}</strong>. </>}
                        {m.observacao && <>“{m.observacao}” </>}
                        {m.tratamento_em && (
                          <span className="text-foreground/50">
                            — {m.tratamento_por ? nomePorId.get(m.tratamento_por) ?? "sistema" : "sistema"},{" "}
                            {formatarDataHora(m.tratamento_em)}
                          </span>
                        )}
                      </p>
                    )}
                    <ConteudoMensagem
                      mensagemId={m.id}
                      doDec={m.isn.startsWith("DEC:")}
                      corpo={m.corpo ? decodificarEntidades(m.corpo).replace(/^[ \t]+/gm, "") : null}
                      lidoPor={
                        m.corpo_lido_em
                          ? `Lido no SOMA por ${m.corpo_lido_por ? nomePorId.get(m.corpo_lido_por) ?? "—" : "—"} em ${formatarDataHora(m.corpo_lido_em)}.`
                          : null
                      }
                      jaTemCiencia={!!m.lida_em || (!!m.ciencia_em && m.ciencia_em <= hoje)}
                      cienciaAutomatica={
                        m.ciencia_em && m.ciencia_em > hoje ? dataSemHora(m.ciencia_em) : tacita ? formatarData(tacita) : null
                      }
                    />
                  </div>
                  <TratamentoMensagem
                    mensagemId={m.id}
                    status={m.status}
                    responsavelId={m.responsavel_id}
                    equipe={equipe}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {comFalha.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">Empresas com erro na última leitura</h2>
          <p className="mb-2 text-xs text-foreground/60">
            Sem leitura = ponto cego. O motivo mais comum é falta de procuração eletrônica no e-CAC com o serviço
            Caixa Postal (código 00006) para a SOMA.
          </p>
          <ul className="divide-y divide-border text-sm">
            {comFalha.map((e) => {
              const l = leituraPorEmpresa.get(e.id)!;
              return (
                <li key={e.id} className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:gap-3">
                  <span className="whitespace-nowrap font-medium">
                    {e.nome} <span className="font-mono font-normal text-foreground/70">{formatarCnpj(e.cnpj)}</span>
                  </span>
                  <span className="text-xs text-foreground/60">
                    {formatarDataHora(l.lida_em as string)}: {l.erro}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Indicador({ titulo, valor, detalhe, alerta }: { titulo: string; valor: number; detalhe?: string; alerta?: boolean }) {
  return (
    <Card className={cn("border-l-4 p-4", alerta ? "border-l-danger" : "border-l-success")}>
      <p className="text-sm text-foreground/60">{titulo}</p>
      <p className={cn("mt-1 text-3xl font-bold", alerta ? "text-danger" : "text-foreground")}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-foreground/50">{detalhe}</p>}
    </Card>
  );
}

function Selo({ status }: { status: StatusTratamento }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 font-semibold",
        status === "nova" && "bg-warning-soft text-warning",
        status === "em_tratamento" && "bg-brand/10 text-brand",
        status === "resolvida" && "bg-success-soft text-success",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
