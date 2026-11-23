"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { marcarEtapaAtualAction, mudarStatusTarefasAction, reatribuirTarefasAction } from "@/lib/actions/tarefas";
import { verificarPagamentoTarefa } from "./acoesTarefa";
import { DetalheTarefa } from "./DetalheTarefa";
import {
  SITUACAO_CLASSE,
  SITUACAO_ROTULO,
  STATUS_ROTULO,
  aberta,
  ddmm,
  rotuloCompetencia,
  situacaoTarefa,
  type Situacao,
  type StatusTarefa,
  type Verificacao,
} from "@/lib/tarefas-comum";

export type TarefaLinha = {
  id: string;
  modelo_id: string | null;
  modelo: string;
  ordem: number;
  company_id: string;
  empresa: string;
  competencia: string;
  departamento_id: string;
  departamento: string;
  responsavel_id: string | null;
  responsavel: string | null;
  prazo_meta: string | null;
  prazo_legal: string | null;
  status: StatusTarefa;
  comentario: string | null;
  aguardando_cliente: boolean;
  concluida_por_fonte: string | null;
  etapas_total: number;
  etapa_indice: number;
  etapa_nome: string | null;
  verificacao: Verificacao | null;
  avulsa: boolean;
  atribuida_em: string | null;
};

const ORDEM_SITUACAO: Situacao[] = ["RISCO", "ATRASADA", "HOJE", "SEMANA", "DEPOIS", "SEM_PRAZO", "AGUARDANDO_CLIENTE", "CONCLUIDA", "NAO_SE_APLICA"];
const PAGINA = 300;
const CHAVE_VISTO = "tarefas:vistoEm";

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

type Filtros = { busca: string; depto: string; resp: string; sit: "" | Situacao; modelo: string; etapa: string };
const FILTROS_VAZIOS: Filtros = { busca: "", depto: "", resp: "", sit: "", modelo: "", etapa: "" };

function lerFiltros(chave: string): Filtros {
  try {
    return { ...FILTROS_VAZIOS, ...JSON.parse(localStorage.getItem(chave) ?? "{}") };
  } catch {
    return FILTROS_VAZIOS;
  }
}

export function TarefasLista({
  linhas,
  equipe,
  hoje,
  modo,
  vazio,
  meuId,
  chave,
}: {
  linhas: TarefaLinha[];
  equipe: { id: string; nome: string }[];
  hoje: string;
  modo: "minhas" | "painel";
  vazio: string;
  /** Para marcar "nova para você" (tarefa que chegou desde a última visita). */
  meuId?: string;
  /** Chave dos filtros salvos (padrão: o modo). */
  chave?: string;
}) {
  const chaveFiltros = `tarefas:filtros:${chave ?? modo}`;
  const [f, setF] = useState<Filtros>(FILTROS_VAZIOS);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(PAGINA);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [vistoEm, setVistoEm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  // Filtros salvos (por tela) e última visita — só no navegador.
  // Restaurar do localStorage só depois de hidratar (no servidor não existe).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setF(lerFiltros(chaveFiltros));
    if (!meuId) return;
    let anterior: string | null = null;
    try {
      anterior = localStorage.getItem(CHAVE_VISTO);
      localStorage.setItem(CHAVE_VISTO, new Date().toISOString());
    } catch {}
    setVistoEm(anterior ?? "1970-01-01");
  }, [chaveFiltros, meuId]);
  const mudarFiltro = (parcial: Partial<Filtros>) =>
    setF((atual) => {
      const novo = { ...atual, ...parcial };
      try {
        localStorage.setItem(chaveFiltros, JSON.stringify(novo));
      } catch {}
      return novo;
    });

  const comSituacao = useMemo(
    () =>
      linhas.map((l) => ({
        ...l,
        sit: situacaoTarefa(l, hoje),
        nova: !!(meuId && vistoEm && l.responsavel_id === meuId && l.atribuida_em && l.atribuida_em > vistoEm && aberta(l.status)),
      })),
    [linhas, hoje, meuId, vistoEm],
  );
  const opcoes = useMemo(() => {
    const ord = (m: Map<string, string>) => [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return {
      deptos: ord(new Map(linhas.map((l) => [l.departamento_id, l.departamento]))),
      modelos: ord(new Map(linhas.map((l) => [l.modelo_id ?? "_avulsa", l.modelo_id ? l.modelo : "Avulsas"]))),
      etapas: [...new Set(linhas.map((l) => l.etapa_nome).filter(Boolean) as string[])].sort(),
    };
  }, [linhas]);
  const contagem = useMemo(() => {
    const c = new Map<Situacao, number>();
    for (const l of comSituacao) c.set(l.sit, (c.get(l.sit) ?? 0) + 1);
    return c;
  }, [comSituacao]);
  const novas = comSituacao.filter((l) => l.nova).length;

  const visiveis = useMemo(() => {
    const q = semAcento(f.busca.trim());
    return comSituacao
      .filter((l) => {
        if (f.depto && l.departamento_id !== f.depto) return false;
        if (f.resp === "_sem" ? l.responsavel_id : f.resp && l.responsavel_id !== f.resp) return false;
        if (f.sit && l.sit !== f.sit) return false;
        if (f.modelo && (l.modelo_id ?? "_avulsa") !== f.modelo) return false;
        if (f.etapa && l.etapa_nome !== f.etapa) return false;
        if (q && !semAcento(`${l.empresa} ${l.modelo}`).includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          Number(b.nova) - Number(a.nova) ||
          ORDEM_SITUACAO.indexOf(a.sit) - ORDEM_SITUACAO.indexOf(b.sit) ||
          (a.prazo_meta ?? "9").localeCompare(b.prazo_meta ?? "9") ||
          a.ordem - b.ordem ||
          a.empresa.localeCompare(b.empresa),
      );
  }, [comSituacao, f]);

  const mostradas = visiveis.slice(0, limite);
  const selecionadas = [...sel].filter((id) => visiveis.some((v) => v.id === id));
  const verificaveis = visiveis.filter((l) => sel.has(l.id) && l.verificacao && aberta(l.status));
  const filtrosAtivos = Object.values(f).some(Boolean);
  const detalhe = detalheId ? linhas.find((l) => l.id === detalheId) ?? null : null;

  const executar = (fn: () => Promise<{ ok: true; mensagem?: string } | { error: string }>, ok: string) =>
    iniciar(async () => {
      const r = await fn();
      if ("error" in r) setMsg({ erro: r.error });
      else {
        setMsg({ ok: r.mensagem ?? ok });
        setSel(new Set());
      }
    });

  const mudarStatus = (ids: string[], status: StatusTarefa) => {
    let comentario: string | null = null;
    if (status === "NAO_SE_APLICA") {
      comentario = window.prompt("Por que não se aplica?");
      if (!comentario?.trim()) return;
    }
    executar(() => mudarStatusTarefasAction({ ids, status, comentario }), `${ids.length} tarefa(s): ${STATUS_ROTULO[status].toLowerCase()}.`);
  };

  const verificar = (l: TarefaLinha) =>
    iniciar(async () => {
      setMsg({ ok: `Consultando o pagamento de ${l.empresa}…` });
      const r = await verificarPagamentoTarefa({ id: l.id, company_id: l.company_id, competencia: l.competencia, verificacao: l.verificacao! });
      setMsg(r.ok ? { ok: `${l.empresa}: ${r.mensagem}` } : { erro: `${l.empresa}: ${r.mensagem}` });
    });

  // Verificar pagamento em lote: uma consulta por tarefa, em sequência.
  const verificarLote = () => {
    const lista = verificaveis;
    if (!lista.length) return;
    const das = lista.filter((l) => l.verificacao === "DAS").length;
    const aviso = das ? `\n\n${das} consulta(s) de DAS na Receita (Integra Contador) são cobradas.` : "";
    if (!window.confirm(`Verificar o pagamento de ${lista.length} tarefa(s)?${aviso}`)) return;
    iniciar(async () => {
      let pagas = 0;
      let erros = 0;
      for (const [i, l] of lista.entries()) {
        setMsg({ ok: `Verificando ${i + 1} de ${lista.length}: ${l.empresa}…` });
        const r = await verificarPagamentoTarefa({ id: l.id, company_id: l.company_id, competencia: l.competencia, verificacao: l.verificacao! });
        if (r.ok) pagas++;
        else if (!/não consta como paga/.test(r.mensagem)) erros++;
      }
      setMsg({ ok: `${lista.length} verificada(s): ${pagas} paga(s) e concluída(s), ${lista.length - pagas - erros} ainda sem pagamento${erros ? `, ${erros} com erro` : ""}.` });
      setSel(new Set());
    });
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const linhasXlsx = visiveis.map((l) => ({
      Situação: SITUACAO_ROTULO[l.sit],
      Status: STATUS_ROTULO[l.status],
      Tarefa: l.modelo,
      Etapa: l.etapa_nome ?? "",
      Empresa: l.empresa,
      Competência: rotuloCompetencia(l.competencia),
      "Meta SOMA": ddmm(l.prazo_meta),
      "Prazo legal": ddmm(l.prazo_legal),
      Departamento: l.departamento,
      Responsável: l.responsavel ?? "",
      Comentário: l.comentario ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasXlsx), "Tarefas");
    XLSX.writeFile(wb, `tarefas-${hoje}.xlsx`);
  };

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const sel_ = "h-8 rounded-lg border border-border bg-surface px-2 text-sm text-foreground";

  return (
    <div className="flex flex-col gap-4">
      {novas > 0 && (
        <div className="rounded-lg border border-brand/40 bg-brand-soft/50 px-3 py-2 text-sm text-brand">
          {novas} tarefa(s) chegaram para você desde a última visita (marcadas como <strong>nova</strong>).
        </div>
      )}
      {/* Contadores por situação (clicáveis = filtro) */}
      <div className="flex flex-wrap gap-2">
        {ORDEM_SITUACAO.filter((s) => contagem.get(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => mudarFiltro({ sit: f.sit === s ? "" : s })}
            className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", SITUACAO_CLASSE[s], f.sit === s ? "ring-2 ring-foreground/60" : "")}
          >
            {SITUACAO_ROTULO[s]} <span className="font-bold">{contagem.get(s)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <input
            type="search"
            value={f.busca}
            onChange={(e) => mudarFiltro({ busca: e.target.value })}
            placeholder="Buscar empresa ou tarefa"
            className="h-8 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground sm:w-56"
          />
          <select value={f.depto} onChange={(e) => mudarFiltro({ depto: e.target.value })} className={sel_}>
            <option value="">Todos os departamentos</option>
            {opcoes.deptos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          <select value={f.modelo} onChange={(e) => mudarFiltro({ modelo: e.target.value })} className={cn(sel_, "max-w-[220px]")}>
            <option value="">Todas as tarefas</option>
            {opcoes.modelos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          {opcoes.etapas.length > 0 && (
            <select value={f.etapa} onChange={(e) => mudarFiltro({ etapa: e.target.value })} className={cn(sel_, "max-w-[200px]")}>
              <option value="">Todas as etapas</option>
              {opcoes.etapas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          )}
          {modo === "painel" && (
            <select value={f.resp} onChange={(e) => mudarFiltro({ resp: e.target.value })} className={sel_}>
              <option value="">Todos os responsáveis</option>
              <option value="_sem">Sem responsável</option>
              {equipe.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
          {filtrosAtivos && (
            <button type="button" onClick={() => mudarFiltro(FILTROS_VAZIOS)} className="text-xs text-brand underline">
              limpar filtros
            </button>
          )}
          <span className="ml-auto flex items-center gap-3 text-xs text-foreground/60">
            {visiveis.length} tarefa(s)
            <button type="button" onClick={exportar} disabled={!visiveis.length} className="rounded-lg border border-border px-2 py-1 text-foreground hover:bg-surface-muted disabled:opacity-50">
              Excel
            </button>
          </span>
        </div>

        {selecionadas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-2 text-sm">
            <span className="font-medium">{selecionadas.length} selecionada(s):</span>
            {verificaveis.length > 0 && (
              <BotaoAcao onClick={verificarLote} disabled={pendente} primario>
                Verificar pagamento ({verificaveis.length})
              </BotaoAcao>
            )}
            <BotaoAcao onClick={() => mudarStatus(selecionadas, "CONCLUIDA")} disabled={pendente} titulo="Só conclui as que não têm etapas">
              Concluir
            </BotaoAcao>
            <BotaoAcao onClick={() => mudarStatus(selecionadas, "NAO_SE_APLICA")} disabled={pendente}>
              Não se aplica
            </BotaoAcao>
            <BotaoAcao onClick={() => mudarStatus(selecionadas, "A_FAZER")} disabled={pendente}>
              Reabrir
            </BotaoAcao>
            <select
              defaultValue=""
              disabled={pendente}
              onChange={(e) => {
                const v = e.target.value;
                e.target.value = "";
                if (!v) return;
                executar(() => reatribuirTarefasAction({ ids: selecionadas, responsavelId: v === "_sem" ? null : v }), "Responsável alterado.");
              }}
              className="h-7 rounded-lg border border-border bg-surface px-2 text-xs text-foreground"
            >
              <option value="">Passar para…</option>
              <option value="_sem">(ninguém)</option>
              {equipe.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => setSel(new Set())} className="ml-auto text-xs text-foreground/60 underline">
              limpar seleção
            </button>
          </div>
        )}
        {msg && <div className={cn("px-4 py-2 text-sm", msg.erro ? "text-danger" : "text-success")}>{msg.erro ?? msg.ok}</div>}

        {/* Celular: cartões */}
        <ul className="divide-y divide-border md:hidden">
          {mostradas.map((l) => (
            <li key={l.id} className="flex gap-3 px-4 py-3">
              <input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} aria-label="Selecionar" className="mt-1" />
              <button type="button" onClick={() => setDetalheId(l.id)} className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", SITUACAO_CLASSE[l.sit])}>{SITUACAO_ROTULO[l.sit]}</span>
                  {l.nova && <span className="rounded bg-brand px-1.5 text-[10px] font-bold text-brand-foreground">nova</span>}
                  <span className="text-[11px] text-foreground/50">
                    meta {ddmm(l.prazo_meta)} · legal {ddmm(l.prazo_legal)}
                  </span>
                </div>
                <div className="mt-1 font-medium text-foreground">{l.modelo}</div>
                <div className="text-sm text-foreground/75">{l.empresa}</div>
                <div className="text-xs text-foreground/50">
                  {l.etapa_nome ? `etapa ${l.etapa_indice + 1}/${l.etapas_total}: ${l.etapa_nome}` : l.departamento}
                  {modo === "painel" ? ` · ${l.responsavel ?? "sem responsável"}` : ""}
                </div>
              </button>
            </li>
          ))}
          {visiveis.length === 0 && <li className="px-4 py-8 text-center text-sm text-foreground/60">{linhas.length ? "Nenhuma tarefa com esse filtro." : vazio}</li>}
        </ul>

        {/* Computador: tabela */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-foreground/50">
                <th className="w-8 px-4 py-2">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todas"
                    checked={mostradas.length > 0 && mostradas.every((l) => sel.has(l.id))}
                    onChange={(e) => setSel(e.target.checked ? new Set(mostradas.map((l) => l.id)) : new Set())}
                  />
                </th>
                <th className="px-2 py-2 font-medium">Situação</th>
                <th className="px-2 py-2 font-medium">Tarefa</th>
                <th className="px-2 py-2 font-medium">Empresa</th>
                {modo === "minhas" && <th className="px-2 py-2 font-medium whitespace-nowrap">Comp.</th>}
                <th className="px-2 py-2 font-medium whitespace-nowrap">Meta · Legal</th>
                {modo === "painel" && <th className="px-2 py-2 font-medium">Responsável</th>}
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mostradas.map((l) => (
                <tr key={l.id} className={cn("border-b border-border/60", sel.has(l.id) ? "bg-brand-soft/30" : l.nova ? "bg-brand-soft/15" : "")}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} aria-label="Selecionar" />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", SITUACAO_CLASSE[l.sit])}>
                      {l.status === "EM_ANDAMENTO" ? "Em andamento · " : ""}
                      {SITUACAO_ROTULO[l.sit]}
                    </span>
                    {l.nova && <span className="ml-1 rounded bg-brand px-1.5 text-[10px] font-bold text-brand-foreground">nova</span>}
                  </td>
                  <td className="min-w-[240px] px-2 py-2">
                    <button type="button" onClick={() => setDetalheId(l.id)} className="text-left font-medium text-foreground hover:text-brand hover:underline">
                      {l.modelo}
                    </button>
                    {l.avulsa && <span className="ml-1.5 rounded bg-surface-muted px-1 text-[10px] text-foreground/60">avulsa</span>}
                    <div className="text-xs text-foreground/50">
                      {l.departamento}
                      {l.etapas_total > 0 && l.etapa_nome ? ` · etapa ${l.etapa_indice + 1}/${l.etapas_total}: ${l.etapa_nome}` : ""}
                      {l.concluida_por_fonte ? ` · automático: ${l.concluida_por_fonte}` : ""}
                      {l.comentario ? ` · 💬 ${l.comentario}` : ""}
                    </div>
                  </td>
                  <td className="min-w-[180px] px-2 py-2 text-foreground/85">{l.empresa}</td>
                  {modo === "minhas" && <td className="px-2 py-2 whitespace-nowrap text-xs text-foreground/60">{rotuloCompetencia(l.competencia)}</td>}
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    {ddmm(l.prazo_meta)} <span className="text-foreground/50">· {ddmm(l.prazo_legal)}</span>
                  </td>
                  {modo === "painel" && <td className="px-2 py-2 text-xs text-foreground/70">{l.responsavel ?? <em className="text-foreground/40">sem</em>}</td>}
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <AcoesLinha
                      l={l}
                      pendente={pendente}
                      concluir={() => mudarStatus([l.id], "CONCLUIDA")}
                      reabrir={() => mudarStatus([l.id], "A_FAZER")}
                      verificar={() => verificar(l)}
                      marcarEtapa={() => executar(() => marcarEtapaAtualAction(l.id), `${l.empresa}: etapa "${l.etapa_nome}" concluída.`)}
                      abrir={() => setDetalheId(l.id)}
                    />
                  </td>
                </tr>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-foreground/60">
                    {linhas.length ? "Nenhuma tarefa com esse filtro." : vazio}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {visiveis.length > limite && (
          <div className="border-t border-border px-4 py-2 text-center">
            <button type="button" onClick={() => setLimite(limite + PAGINA)} className="text-sm text-brand underline">
              Mostrar mais ({visiveis.length - limite} restantes)
            </button>
          </div>
        )}
      </Card>

      {detalhe && <DetalheTarefa key={detalhe.id} linha={detalhe} hoje={hoje} aoFechar={() => setDetalheId(null)} />}
    </div>
  );
}

/**
 * Ações da linha. Tarefa com etapas NÃO tem "Concluir": avança etapa por
 * etapa, e só fecha tudo de uma vez pelo "Verificar pagamento" (consulta na
 * central do Simples/ISS). Sem etapas, continua o Concluir simples.
 */
function AcoesLinha({
  l,
  pendente,
  concluir,
  reabrir,
  verificar,
  marcarEtapa,
  abrir,
}: {
  l: TarefaLinha;
  pendente: boolean;
  concluir: () => void;
  reabrir: () => void;
  verificar: () => void;
  marcarEtapa: () => void;
  abrir: () => void;
}) {
  if (!aberta(l.status)) {
    return l.etapas_total > 0 && l.status === "CONCLUIDA" ? (
      <BotaoAcao onClick={abrir} disabled={pendente}>
        Ver etapas
      </BotaoAcao>
    ) : (
      <BotaoAcao onClick={reabrir} disabled={pendente}>
        Reabrir
      </BotaoAcao>
    );
  }
  if (!l.etapas_total) {
    return (
      <BotaoAcao onClick={concluir} disabled={pendente} primario>
        Concluir
      </BotaoAcao>
    );
  }
  const etapaPagamento = l.verificacao && l.aguardando_cliente;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {!etapaPagamento && l.etapa_nome && (
        <BotaoAcao onClick={marcarEtapa} disabled={pendente} primario={!l.verificacao} titulo={`Concluir a etapa: ${l.etapa_nome}`}>
          ✓ Etapa {l.etapa_indice + 1}
        </BotaoAcao>
      )}
      {l.verificacao && (
        <BotaoAcao onClick={verificar} disabled={pendente} primario titulo="Consulta o pagamento na central e, se pago, conclui todas as etapas">
          Verificar pgto.
        </BotaoAcao>
      )}
    </span>
  );
}

function BotaoAcao({
  children,
  onClick,
  disabled,
  primario,
  titulo,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primario?: boolean;
  titulo?: string;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50",
        primario ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-foreground hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
