import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";
import { formatarData, formatarDataHora } from "@/lib/formatters";
import { cn } from "@/lib/cn";
import { hojeBrasilia } from "@/lib/competencia";
import { ehIntimacao, ORIGEM, STATUS_LABEL, type StatusTratamento } from "@/lib/caixa-postal-core";
import { empresasParaLer } from "@/lib/caixa-postal";
import { TratamentoMensagem } from "./TratamentoMensagem";
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
      "id, company_id, assunto, relevante, tipo_origem, descricao_origem, enviada_em, lida_em, ciencia_em, vista_em, status, responsavel_id, observacao, tratamento_em, tratamento_por",
    )
    .order("enviada_em", { ascending: false, nullsFirst: false })
    .limit(filtro === "abertas" ? 1000 : 400);
  if (filtro === "abertas") consulta = consulta.neq("status", "resolvida");
  if (filtro === "resolvidas") consulta = consulta.eq("status", "resolvida");
  if (empresaFiltro) consulta = consulta.eq("company_id", empresaFiltro);

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
  const leituraPorEmpresa = new Map((leituras ?? []).map((l) => [l.company_id as string, l]));

  const destaque = (m: { relevante: boolean; assunto: string }) => m.relevante || ehIntimacao(m.assunto);
  const ordemStatus: Record<StatusTratamento, number> = { nova: 0, em_tratamento: 1, resolvida: 2 };
  const mensagens = ((mensagensBrutas ?? []) as Linha[])
    .filter((m) => !soDestaque || destaque(m))
    .sort(
      (a, b) =>
        ordemStatus[a.status] - ordemStatus[b.status] ||
        Number(destaque(b)) - Number(destaque(a)) ||
        (b.enviada_em ?? "").localeCompare(a.enviada_em ?? ""),
    );

  const abertas = contagens ?? [];
  const nNovas = abertas.filter((m) => m.status === "nova").length;
  const nDestaqueAbertas = abertas.filter((m) => destaque(m as { relevante: boolean; assunto: string })).length;
  const nEmTratamento = abertas.filter((m) => m.status === "em_tratamento").length;
  const comFalha = empresas.filter((e) => leituraPorEmpresa.get(e.id)?.ok === false);
  const nuncaLidas = empresas.filter((e) => !leituraPorEmpresa.has(e.id));
  const ultimaLeitura = (leituras ?? [])
    .filter((l) => l.ok)
    .map((l) => l.lida_em as string)
    .sort()
    .at(-1);

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
            Caixa Postal do e-CAC de toda a carteira, lida pelo Integra Contador toda segunda-feira, às 7h.
            {ultimaLeitura ? ` Última leitura: ${formatarDataHora(ultimaLeitura)}.` : " Ainda não houve leitura."}
          </p>
        </div>
        <LerCaixaPostalButton
          empresas={empresas.filter((e) => !empresaFiltro || e.id === empresaFiltro).map((e) => ({ id: e.id, nome: e.nome }))}
          rotulo={empresaFiltro ? "Ler esta empresa agora" : "Ler todas agora"}
        />
      </div>

      <div className="rounded-xl border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
        <strong>Abrir a mensagem no e-CAC dá ciência da intimação e o prazo começa a contar.</strong> O SOMA lê só a
        lista (assunto, data, relevância, se alguém já abriu), que <strong>não dá ciência</strong>. Sem abrir, a
        ciência acontece sozinha {PRAZO_CIENCIA_TACITA_DIAS} dias depois do envio. Decida quem vai tratar antes de
        abrir no portal.
      </div>

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
                          Aberta no e-CAC em {formatarDataHora(m.lida_em)} (já tem ciência)
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
                  <span className="whitespace-nowrap font-medium">{e.nome}</span>
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
