import Link from "next/link";
import { requirePermissao, temPermissao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buscarTudoPaginado } from "@/lib/supabase/paginacao";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SITUACAO_LABELS, type SeiSituacao } from "@/lib/sei-labels";
import { coberturaPetropolis } from "@/lib/sei-cobertura";
import { NovidadeBadge, OrigemBadge, SituacaoBadge, dataHoraBr, temNovidade } from "./situacao";

export const metadata = { title: "SEI — Legalização" };

const SITUACOES: SeiSituacao[] = ["EXIGENCIA", "EM_ANDAMENTO", "LICENCA_EMITIDA", "CONCLUIDO"];

type Linha = {
  id: string;
  numero: string;
  tipo: string | null;
  situacao: SeiSituacao;
  company_id: string | null;
  requerente_nome: string | null;
  interessados: string[];
  ultimo_andamento_em: string | null;
  ultimo_andamento_texto: string | null;
  novidade_em: string | null;
  visto_em: string | null;
  acesso_expirado: boolean;
  arquivado_em: string | null;
  motivo_arquivamento: string | null;
  origem: string | null;
  cadastrado_em: string | null;
  sincronizado_em: string | null;
  empresa: { legal_name: string; trade_name: string | null; codigo_cliente: string | null; ativa: boolean } | null;
};

export default async function SeiPage(props: PageProps<"/legalizacao/sei">) {
  await requirePermissao("legalizacao.ver");
  const podeEditar = await temPermissao("legalizacao.editar");
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const situacao = typeof sp.situacao === "string" ? sp.situacao : "";
  const filtro = typeof sp.filtro === "string" ? sp.filtro : "";

  const supabase = await createClient();
  const [processos, { data: ultimaSync }, cobertura] = await Promise.all([
    buscarTudoPaginado((from, to) =>
      supabase
        .from("sei_processos")
        .select(
          "id, numero, tipo, situacao, company_id, requerente_nome, interessados, ultimo_andamento_em, ultimo_andamento_texto, novidade_em, visto_em, acesso_expirado, arquivado_em, motivo_arquivamento, origem, cadastrado_em, sincronizado_em, empresa:companies(legal_name, trade_name, codigo_cliente, ativa)",
        )
        .order("ultimo_andamento_em", { ascending: false, nullsFirst: false })
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("sei_sincronizacoes")
      .select("iniciado_em, finalizado_em, status, processos, documentos_novos, andamentos_novos")
      .order("iniciado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A contagem de cobertura não pode derrubar a lista de processos.
    coberturaPetropolis(supabase).catch((e) => {
      console.error("SEI: falha na cobertura de Petrópolis", e);
      return null;
    }),
  ]);
  const todosProcessos = processos as unknown as Linha[];
  const arquivados = todosProcessos.filter((l) => l.arquivado_em);
  // Fora "Arquivados", os arquivados não entram em lista nem em contagem.
  const todas = todosProcessos.filter((l) => !l.arquivado_em);
  const semProcesso = cobertura ? cobertura.filter((c) => c.situacao === "SEM_PROCESSO").length : 0;
  const clienteInativo = (l: Linha) => !!l.empresa && !l.empresa.ativa;

  const nomeCliente = (l: Linha) => l.empresa?.trade_name || l.empresa?.legal_name || null;
  const alvo = normalizar(q);
  const linhas = (filtro === "arquivados" ? arquivados : todas).filter((l) => {
    if (situacao && l.situacao !== situacao) return false;
    if (filtro === "sem_cliente" && l.company_id) return false;
    if (filtro === "novidade" && !temNovidade(l)) return false;
    if (filtro === "cliente_inativo" && !clienteInativo(l)) return false;
    if (alvo) {
      const texto = normalizar(
        [l.numero, l.tipo, nomeCliente(l), l.empresa?.legal_name, l.requerente_nome, ...l.interessados].join(" "),
      );
      if (!texto.includes(alvo)) return false;
    }
    return true;
  });

  const contar = (f: (l: Linha) => boolean) => todas.filter(f).length;
  const url = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (situacao) params.set("situacao", situacao);
    if (filtro) params.set("filtro", filtro);
    for (const [k, v] of Object.entries(extra)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    const s = params.toString();
    return s ? `/legalizacao/sei?${s}` : "/legalizacao/sei";
  };

  const cards: { chave: string; label: string; n: number; href: string; ativo: boolean; destaque?: boolean }[] = [
    { chave: "novidade", label: "Com novidade", n: contar(temNovidade), href: url({ filtro: filtro === "novidade" ? "" : "novidade" }), ativo: filtro === "novidade", destaque: true },
    ...SITUACOES.map((s) => ({
      chave: s,
      label: SITUACAO_LABELS[s],
      n: contar((l) => l.situacao === s),
      href: url({ situacao: situacao === s ? "" : s }),
      ativo: situacao === s,
    })),
    { chave: "sem_cliente", label: "Sem cliente", n: contar((l) => !l.company_id), href: url({ filtro: filtro === "sem_cliente" ? "" : "sem_cliente" }), ativo: filtro === "sem_cliente" },
  ];
  const cardsExtras: typeof cards = [
    { chave: "cobertura", label: cobertura ? "Clientes de Petrópolis sem processo" : "Clientes sem processo (erro ao contar)", n: semProcesso, href: "/legalizacao/sei/cobertura", ativo: false, destaque: true },
    { chave: "cliente_inativo", label: "Cliente inativo (arquivar?)", n: contar(clienteInativo), href: url({ filtro: filtro === "cliente_inativo" ? "" : "cliente_inativo" }), ativo: filtro === "cliente_inativo", destaque: true },
    { chave: "arquivados", label: "Arquivados", n: arquivados.length, href: url({ filtro: filtro === "arquivados" ? "" : "arquivados" }), ativo: filtro === "arquivados" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">SEI — Prefeitura de Petrópolis</h1>
          {podeEditar && (
            <Link href="/legalizacao/sei/novo">
              <Button variant="secondary">+ Processo manual</Button>
            </Link>
          )}
        </div>
        <p className="text-sm text-foreground/60">
          {todas.length} processo(s) acompanhados (acesso externo da SOMA e cadastrados à mão).{" "}
          {ultimaSync ? (
            <>
              Última sincronização: {dataHoraBr(ultimaSync.finalizado_em ?? ultimaSync.iniciado_em)}
              {ultimaSync.status !== "OK" && ` (${ultimaSync.status.toLowerCase().replace("_", " ")})`}.
            </>
          ) : (
            "Ainda não sincronizado."
          )}{" "}
          Para atualizar: logue no SEI e clique no ícone da extensão <strong>SOMA · SEI</strong> no Chrome.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link key={c.chave} href={c.href}>
            <Card className={`p-4 transition-colors ${c.ativo ? "border-brand ring-2 ring-brand/20" : "hover:bg-surface-muted"}`}>
              <div className={`text-2xl font-semibold ${c.destaque && c.n > 0 ? "text-danger" : "text-foreground"}`}>{c.n}</div>
              <div className="text-xs text-foreground/50">{c.label}</div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cardsExtras.map((c) => (
          <Link key={c.chave} href={c.href}>
            <Card
              className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${c.ativo ? "border-brand ring-2 ring-brand/20" : "hover:bg-surface-muted"}`}
            >
              <div className="text-sm text-foreground/70">{c.label}</div>
              <div className={`text-xl font-semibold ${c.destaque && c.n > 0 ? "text-danger" : "text-foreground"}`}>{c.n}</div>
            </Card>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-3">
        {situacao && <input type="hidden" name="situacao" value={situacao} />}
        {filtro && <input type="hidden" name="filtro" value={filtro} />}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-foreground/60">Buscar</label>
          <Input name="q" defaultValue={q} placeholder="Processo, cliente, tipo…" className="w-72" />
        </div>
        <Button type="submit" variant="secondary">Filtrar</Button>
        {(q || situacao || filtro) && (
          <Link href="/legalizacao/sei" className="py-2 text-sm text-foreground/60 hover:text-foreground">
            Limpar
          </Link>
        )}
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-foreground/50">
            <tr>
              <th className="px-4 py-3 font-medium">Processo</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Situação</th>
              <th className="px-4 py-3 font-medium">Último andamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border align-top last:border-0 hover:bg-surface-muted/50">
                <td className="px-4 py-3">
                  <Link href={`/legalizacao/sei/${l.id}`} className="font-medium text-brand hover:underline">
                    {l.numero}
                  </Link>
                  <div className="text-xs text-foreground/50">{l.tipo}</div>
                </td>
                <td className="px-4 py-3">
                  {nomeCliente(l) ? (
                    <>
                      {l.empresa?.codigo_cliente && <span className="mr-1 text-foreground/40">#{l.empresa.codigo_cliente}</span>}
                      {nomeCliente(l)}
                    </>
                  ) : (
                    <span className="text-warning">
                      Sem cliente{l.requerente_nome ? ` — lido: ${l.requerente_nome}` : ""}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <SituacaoBadge situacao={l.situacao} />
                    <OrigemBadge origem={l.origem} cadastradoEm={l.cadastrado_em} sincronizadoEm={l.sincronizado_em} />
                    {temNovidade(l) && <NovidadeBadge />}
                    {l.acesso_expirado && <span className="text-xs text-foreground/40">acesso expirado</span>}
                    {!l.arquivado_em && clienteInativo(l) && (
                      <span className="text-xs text-danger">cliente inativo — arquivar?</span>
                    )}
                  </div>
                  {l.arquivado_em && (
                    <div className="mt-1 text-xs text-foreground/50">
                      Arquivado em {dataHoraBr(l.arquivado_em)}
                      {l.motivo_arquivamento && ` — ${l.motivo_arquivamento}`}
                    </div>
                  )}
                </td>
                <td className="max-w-md px-4 py-3">
                  <div className="text-xs text-foreground/50">{dataHoraBr(l.ultimo_andamento_em)}</div>
                  <div className="line-clamp-2 text-foreground/80">{l.ultimo_andamento_texto}</div>
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-foreground/50">
                  Nenhum processo{todas.length ? " com esse filtro" : " ainda: rode a extensão SOMA · SEI"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function normalizar(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
