"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { marcarEtapaAtualAction, mudarStatusTarefasAction, reatribuirTarefasAction } from "@/lib/actions/tarefas";
import { verificarPagamentoTarefa } from "./acoesTarefa";
import { ChecklistTarefa } from "./ChecklistTarefa";
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
  modelo_id: string;
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
};

const ORDEM_SITUACAO: Situacao[] = ["RISCO", "ATRASADA", "HOJE", "SEMANA", "DEPOIS", "SEM_PRAZO", "AGUARDANDO_CLIENTE", "CONCLUIDA", "NAO_SE_APLICA"];
const PAGINA = 300;

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function TarefasLista({
  linhas,
  equipe,
  hoje,
  modo,
  vazio,
}: {
  linhas: TarefaLinha[];
  equipe: { id: string; nome: string }[];
  hoje: string;
  modo: "minhas" | "painel";
  vazio: string;
}) {
  const [busca, setBusca] = useState("");
  const [depto, setDepto] = useState("");
  const [resp, setResp] = useState("");
  const [sit, setSit] = useState<"" | Situacao>("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [limite, setLimite] = useState(PAGINA);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ erro?: string; ok?: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const comSituacao = useMemo(() => linhas.map((l) => ({ ...l, sit: situacaoTarefa(l, hoje) })), [linhas, hoje]);
  const departamentos = useMemo(
    () => [...new Map(linhas.map((l) => [l.departamento_id, l.departamento])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [linhas],
  );
  const contagem = useMemo(() => {
    const c = new Map<Situacao, number>();
    for (const l of comSituacao) c.set(l.sit, (c.get(l.sit) ?? 0) + 1);
    return c;
  }, [comSituacao]);

  const visiveis = useMemo(() => {
    const q = semAcento(busca.trim());
    return comSituacao
      .filter((l) => {
        if (depto && l.departamento_id !== depto) return false;
        if (resp === "_sem" ? l.responsavel_id : resp && l.responsavel_id !== resp) return false;
        if (sit && l.sit !== sit) return false;
        if (q && !semAcento(`${l.empresa} ${l.modelo}`).includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          ORDEM_SITUACAO.indexOf(a.sit) - ORDEM_SITUACAO.indexOf(b.sit) ||
          (a.prazo_meta ?? "9").localeCompare(b.prazo_meta ?? "9") ||
          a.ordem - b.ordem ||
          a.empresa.localeCompare(b.empresa),
      );
  }, [comSituacao, busca, depto, resp, sit]);

  const mostradas = visiveis.slice(0, limite);
  const selecionadas = [...sel].filter((id) => visiveis.some((v) => v.id === id));

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
    executar(
      () => mudarStatusTarefasAction({ ids, status, comentario }),
      `${ids.length} tarefa(s): ${STATUS_ROTULO[status].toLowerCase()}.`,
    );
  };

  const verificar = (l: TarefaLinha) =>
    iniciar(async () => {
      setMsg({ ok: `Consultando o pagamento de ${l.empresa}…` });
      const r = await verificarPagamentoTarefa({ id: l.id, company_id: l.company_id, competencia: l.competencia, verificacao: l.verificacao! });
      setMsg(r.ok ? { ok: `${l.empresa}: ${r.mensagem}` } : { erro: `${l.empresa}: ${r.mensagem}` });
    });

  const alternar = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="flex flex-col gap-4">
      {/* Contadores por situação (clicáveis = filtro) */}
      <div className="flex flex-wrap gap-2">
        {ORDEM_SITUACAO.filter((s) => contagem.get(s)).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSit(sit === s ? "" : s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium",
              SITUACAO_CLASSE[s],
              sit === s ? "ring-2 ring-foreground/60" : "",
            )}
          >
            {SITUACAO_ROTULO[s]} <span className="font-bold">{contagem.get(s)}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar empresa ou tarefa"
            className="h-8 w-60 rounded-lg border border-border bg-surface px-3 text-sm text-foreground"
          />
          <select
            value={depto}
            onChange={(e) => setDepto(e.target.value)}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
          >
            <option value="">Todos os departamentos</option>
            {departamentos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
          </select>
          {modo === "painel" && (
            <select
              value={resp}
              onChange={(e) => setResp(e.target.value)}
              className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-foreground"
            >
              <option value="">Todos os responsáveis</option>
              <option value="_sem">Sem responsável</option>
              {equipe.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          )}
          <span className="ml-auto text-xs text-foreground/60">{visiveis.length} tarefa(s)</span>
        </div>

        {selecionadas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-2 text-sm">
            <span className="font-medium">{selecionadas.length} selecionada(s):</span>
            <BotaoAcao onClick={() => mudarStatus(selecionadas, "CONCLUIDA")} disabled={pendente}>
              Concluir
            </BotaoAcao>
            <BotaoAcao onClick={() => mudarStatus(selecionadas, "EM_ANDAMENTO")} disabled={pendente}>
              Em andamento
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
                const id = v === "_sem" ? null : v;
                executar(() => reatribuirTarefasAction({ ids: selecionadas, responsavelId: id }), "Responsável alterado.");
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
        {msg && (
          <div className={cn("px-4 py-2 text-sm", msg.erro ? "text-danger" : "text-success")}>{msg.erro ?? msg.ok}</div>
        )}

        <div className="overflow-x-auto">
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
                <Fragment key={l.id}>
                <tr className={cn(expandida === l.id ? "" : "border-b border-border/60", sel.has(l.id) ? "bg-brand-soft/30" : "")}>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} aria-label="Selecionar" />
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-semibold", SITUACAO_CLASSE[l.sit])}>
                      {l.status === "EM_ANDAMENTO" ? "Em andamento · " : ""}
                      {SITUACAO_ROTULO[l.sit]}
                    </span>
                  </td>
                  <td className="min-w-[240px] px-2 py-2">
                    {l.etapas_total > 0 ? (
                      <button
                        type="button"
                        onClick={() => setExpandida(expandida === l.id ? null : l.id)}
                        className="text-left font-medium text-foreground hover:text-brand"
                      >
                        {expandida === l.id ? "▾" : "▸"} {l.modelo}
                      </button>
                    ) : (
                      <div className="font-medium text-foreground">{l.modelo}</div>
                    )}
                    <div className="text-xs text-foreground/50">
                      {l.departamento}
                      {l.etapas_total > 0 && l.etapa_nome ? ` · etapa ${l.etapa_indice + 1}/${l.etapas_total}: ${l.etapa_nome}` : ""}
                      {l.concluida_por_fonte ? ` · automático: ${l.concluida_por_fonte}` : ""}
                      {l.comentario ? ` · ${l.comentario}` : ""}
                    </div>
                  </td>
                  <td className="min-w-[180px] px-2 py-2 text-foreground/85">{l.empresa}</td>
                  {modo === "minhas" && (
                    <td className="px-2 py-2 whitespace-nowrap text-xs text-foreground/60">{rotuloCompetencia(l.competencia)}</td>
                  )}
                  <td className="px-2 py-2 whitespace-nowrap text-xs">
                    {ddmm(l.prazo_meta)} <span className="text-foreground/50">· {ddmm(l.prazo_legal)}</span>
                  </td>
                  {modo === "painel" && (
                    <td className="px-2 py-2 text-xs text-foreground/70">{l.responsavel ?? <em className="text-foreground/40">sem</em>}</td>
                  )}
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    <AcoesLinha
                      l={l}
                      pendente={pendente}
                      concluir={() => mudarStatus([l.id], "CONCLUIDA")}
                      reabrir={() => mudarStatus([l.id], "A_FAZER")}
                      verificar={() => verificar(l)}
                      marcarEtapa={() => executar(() => marcarEtapaAtualAction(l.id), `${l.empresa}: etapa "${l.etapa_nome}" concluída.`)}
                      abrirEtapas={() => setExpandida(l.id)}
                    />
                  </td>
                </tr>
                {expandida === l.id && (
                  <tr className="border-b border-border/60 bg-surface-muted/40">
                    <td />
                    <td colSpan={6} className="px-2 pb-3">
                      <ChecklistTarefa tarefaId={l.id} horizontal />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-foreground/60">
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
    </div>
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
  abrirEtapas,
}: {
  l: TarefaLinha;
  pendente: boolean;
  concluir: () => void;
  reabrir: () => void;
  verificar: () => void;
  marcarEtapa: () => void;
  abrirEtapas: () => void;
}) {
  if (!aberta(l.status)) {
    return l.etapas_total > 0 && l.status === "CONCLUIDA" ? (
      <BotaoAcao onClick={abrirEtapas} disabled={pendente}>
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
