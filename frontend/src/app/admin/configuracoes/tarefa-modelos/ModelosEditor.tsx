"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import {
  excluirModeloAction,
  gerarTarefasAction,
  salvarExcecaoAction,
  salvarModeloAction,
  type EtapaModeloInput,
  type ModeloInput,
} from "@/lib/actions/tarefas";
import { EtapasEditor } from "./EtapasEditor";
import { RevisarGeracao } from "./RevisarGeracao";
import { FONTES_ROTULO, REGIMES, rotuloCompetencia } from "@/lib/tarefas-comum";
import type { Modelo } from "@/lib/tarefas";

export type Obrigacao = { chave: string; rotulo: string; relevante: boolean };
type Opcao = { id: string; nome: string };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const PERIODICIDADE = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral", ANUAL: "Anual" } as const;

const NOVO: ModeloInput = {
  id: null,
  nome: "",
  descricao: null,
  departamento_id: "",
  periodicidade: "MENSAL",
  meses: null,
  prazo_tipo: "DIA_FIXO",
  agenda_chave: null,
  dia_prazo: 10,
  dia_meta: null,
  mes_prazo_offset: 1,
  aplica_regimes: null,
  aplica_pessoa: "PJ",
  aplica_municipios: null,
  aplica_folha: null,
  fonte_automatica: null,
  responsavel_fixo_id: null,
  ativo: false,
  ordem: 0,
};

function paraInput(m: Modelo): ModeloInput {
  return { ...m };
}

function resumoPrazo(m: Modelo, obrigacao: string | null | undefined) {
  const quando = m.mes_prazo_offset === 0 ? "no mês" : m.mes_prazo_offset === 1 ? "mês seguinte" : `+${m.mes_prazo_offset} meses`;
  const meta = m.dia_meta ? ` · meta dia ${m.dia_meta}` : "";
  if (m.prazo_tipo === "DIA_FIXO") return `Dia ${m.dia_prazo} (${quando})${meta}`;
  return `Agenda: ${obrigacao ?? m.agenda_chave ?? "—"} (${quando})${meta}`;
}

function resumoAplica(m: Modelo, municipios: { codigo: string; nome: string }[]) {
  const partes: string[] = [];
  if (m.aplica_pessoa) partes.push(m.aplica_pessoa);
  if (m.aplica_regimes?.length) partes.push(m.aplica_regimes.map((r) => REGIMES.find((x) => x.valor === r)?.rotulo ?? r).join("/"));
  if (m.aplica_municipios?.length)
    partes.push(m.aplica_municipios.map((c) => municipios.find((x) => x.codigo === c)?.nome ?? c).join(", "));
  if (m.aplica_folha === true) partes.push("com folha");
  if (m.aplica_folha === false) partes.push("sem folha");
  return partes.join(" · ") || "Todas";
}

export function ModelosEditor({
  modelos,
  departamentos,
  obrigacoes,
  municipios,
  empresas,
  excecoes,
  alcance,
  obrigacaoDoModelo,
  competenciaPadrao,
  etapas,
  equipe,
}: {
  modelos: Modelo[];
  departamentos: Opcao[];
  obrigacoes: Obrigacao[];
  municipios: { codigo: string; nome: string }[];
  empresas: Opcao[];
  excecoes: { modelo_id: string; company_id: string; tipo: "INCLUIR" | "EXCLUIR" }[];
  alcance: Record<string, number>;
  obrigacaoDoModelo: Record<string, string | null>;
  competenciaPadrao: string;
  etapas: Record<string, EtapaModeloInput[]>;
  equipe: Opcao[];
}) {
  const [editando, setEditando] = useState<ModeloInput | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string } | null>(null);
  const [competencia, setCompetencia] = useState(competenciaPadrao);
  const [revisando, setRevisando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const nomeDepto = new Map(departamentos.map((d) => [d.id, d.nome]));
  const ativos = modelos.filter((m) => m.ativo).length;

  const alternarAtivo = (m: Modelo) =>
    iniciar(async () => {
      const r = await salvarModeloAction({ ...paraInput(m), ativo: !m.ativo });
      setMsg("error" in r ? { erro: r.error } : { ok: `${m.nome}: ${m.ativo ? "desativado" : "ativado"}.` });
    });

  const gerar = () => {
    if (!window.confirm(`Gerar as tarefas de ${rotuloCompetencia(competencia)} para os ${ativos} modelo(s) ativo(s)?`)) return;
    iniciar(async () => {
      const r = await gerarTarefasAction({ competencia });
      setMsg("error" in r ? { erro: r.error } : { ok: r.mensagem });
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditando({ ...NOVO, ordem: (modelos.at(-1)?.ordem ?? 0) + 10 })}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-foreground"
        >
          Novo modelo
        </button>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <span className="text-foreground/60">Gerar agora a competência</span>
          <input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            className="h-8 rounded-lg border border-border bg-surface px-2 text-sm"
          />
          <button
            type="button"
            onClick={gerar}
            disabled={pendente || !ativos || !competencia}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Gerar
          </button>
          <button
            type="button"
            onClick={() => setRevisando(true)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium"
            title="Mostra o que sobra e o que falta pelo cadastro atual antes de mexer"
          >
            Revisar e gerar novamente
          </button>
        </div>
      </div>
      {msg && <div className={cn("text-sm", msg.erro ? "text-danger" : "text-success")}>{msg.erro ?? msg.ok}</div>}

      {revisando && (
        <RevisarGeracao
          competenciaInicial={competencia}
          modelos={modelos.map((m) => ({ id: m.id, nome: m.nome }))}
          aoFechar={() => setRevisando(false)}
        />
      )}

      {editando && (
        <FormModelo
          key={editando.id ?? "novo"}
          inicial={editando}
          departamentos={departamentos}
          obrigacoes={obrigacoes}
          municipios={municipios}
          empresas={empresas}
          excecoes={excecoes.filter((x) => x.modelo_id === editando.id)}
          obrigacaoAtual={editando.id ? obrigacaoDoModelo[editando.id] ?? null : null}
          etapas={editando.id ? etapas[editando.id] ?? [] : []}
          equipe={equipe}
          aoFechar={(texto) => {
            setEditando(null);
            if (texto) setMsg({ ok: texto });
          }}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-foreground/50">
              <th className="px-4 py-2 font-medium">Ativo</th>
              <th className="px-2 py-2 font-medium">Tarefa</th>
              <th className="px-2 py-2 font-medium">Departamento</th>
              <th className="px-2 py-2 font-medium">Prazo</th>
              <th className="px-2 py-2 font-medium">Aplica a</th>
              <th className="px-2 py-2 font-medium whitespace-nowrap">Empresas hoje</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {modelos.map((m) => (
              <tr key={m.id} className={cn("border-b border-border/60 align-top", m.ativo ? "" : "text-foreground/55")}>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={m.ativo}
                    disabled={pendente}
                    onChange={() => alternarAtivo(m)}
                    aria-label={m.ativo ? "Desativar" : "Ativar"}
                  />
                </td>
                <td className="px-2 py-2">
                  <div className="font-medium text-foreground">{m.nome}</div>
                  <div className="text-xs text-foreground/50">
                    {etapas[m.id]?.length ? `${etapas[m.id].length} etapas · ` : ""}
                    {m.fonte_automatica ? "automática · " : ""}
                    {PERIODICIDADE[m.periodicidade]}
                    {m.periodicidade !== "MENSAL" && m.meses?.length ? ` (${m.meses.map((x) => MESES[x - 1]).join(", ")})` : ""}
                  </div>
                </td>
                <td className="px-2 py-2 text-xs">
                  {nomeDepto.get(m.departamento_id) ?? "—"}
                  {m.responsavel_fixo_id && (
                    <div className="mt-0.5 font-medium text-foreground/80">
                      fixo: {equipe.find((u) => u.id === m.responsavel_fixo_id)?.nome ?? "—"}
                    </div>
                  )}
                </td>
                <td className="max-w-[340px] px-2 py-2 text-xs">{resumoPrazo(m, obrigacaoDoModelo[m.id])}</td>
                <td className="px-2 py-2 text-xs">{resumoAplica(m, municipios)}</td>
                <td className="px-2 py-2 text-center text-xs">{alcance[m.id] ?? 0}</td>
                <td className="px-4 py-2 text-right">
                  <button type="button" onClick={() => setEditando(paraInput(m))} className="text-xs text-brand underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {modelos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-foreground/60">
                  Nenhum modelo ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FormModelo({
  inicial,
  departamentos,
  obrigacoes,
  municipios,
  empresas,
  excecoes,
  obrigacaoAtual,
  etapas,
  equipe,
  aoFechar,
}: {
  inicial: ModeloInput;
  departamentos: Opcao[];
  obrigacoes: Obrigacao[];
  municipios: { codigo: string; nome: string }[];
  empresas: Opcao[];
  excecoes: { company_id: string; tipo: "INCLUIR" | "EXCLUIR" }[];
  obrigacaoAtual: string | null;
  etapas: EtapaModeloInput[];
  equipe: Opcao[];
  aoFechar: (msg?: string) => void;
}) {
  const [m, setM] = useState<ModeloInput>(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const set = <K extends keyof ModeloInput>(k: K, v: ModeloInput[K]) => setM((x) => ({ ...x, [k]: v }));
  const toggle = <T,>(lista: T[] | null, v: T): T[] => (lista?.includes(v) ? lista.filter((x) => x !== v) : [...(lista ?? []), v]);
  const chaveForaDaLista = m.agenda_chave && !obrigacoes.some((o) => o.chave === m.agenda_chave);

  const salvar = () =>
    iniciar(async () => {
      const r = await salvarModeloAction(m);
      if ("error" in r) setErro(r.error);
      else aoFechar(`Modelo "${m.nome}" salvo.`);
    });
  const excluir = () => {
    if (!m.id || !window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    iniciar(async () => {
      const r = await excluirModeloAction(m.id!);
      if ("error" in r) setErro(r.error);
      else aoFechar(`Modelo "${m.nome}" excluído.`);
    });
  };

  const campo = "h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground";
  const rotulo = "text-xs font-medium text-foreground/60";

  return (
    <Card className="flex flex-col gap-4 border-brand/40 p-5">
      <div className="text-sm font-semibold">{m.id ? "Editar modelo" : "Novo modelo"}</div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className={rotulo}>Tarefa</span>
          <input value={m.nome} onChange={(e) => set("nome", e.target.value)} className={campo} placeholder="ex.: Apurar Simples e enviar DAS" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Departamento</span>
          <select value={m.departamento_id} onChange={(e) => set("departamento_id", e.target.value)} className={campo}>
            <option value="">—</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo} title="Vazio = responsável da carteira de cada empresa">
            Responsável fixo (opcional)
          </span>
          <select
            value={m.responsavel_fixo_id ?? ""}
            onChange={(e) => set("responsavel_fixo_id", e.target.value || null)}
            className={campo}
          >
            <option value="">Carteira da empresa</option>
            {equipe.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Ordem na lista</span>
          <input type="number" value={m.ordem} onChange={(e) => set("ordem", Number(e.target.value))} className={campo} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-4">
          <span className={rotulo}>Instruções (opcional)</span>
          <input value={m.descricao ?? ""} onChange={(e) => set("descricao", e.target.value)} className={campo} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-foreground/70">Quando gera e prazo</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Periodicidade</span>
            <select
              value={m.periodicidade}
              onChange={(e) => {
                const p = e.target.value as ModeloInput["periodicidade"];
                setM((x) => ({ ...x, periodicidade: p, meses: p === "MENSAL" ? null : p === "TRIMESTRAL" ? [3, 6, 9, 12] : [12] }));
              }}
              className={campo}
            >
              {Object.entries(PERIODICIDADE).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {m.periodicidade !== "MENSAL" && (
            <div className="flex flex-col gap-1">
              <span className={rotulo}>Competências que geram</span>
              <div className="flex flex-wrap gap-1">
                {MESES.map((nome, i) => (
                  <button
                    key={nome}
                    type="button"
                    onClick={() => set("meses", toggle(m.meses, i + 1))}
                    className={cn(
                      "rounded px-1.5 py-1 text-xs",
                      m.meses?.includes(i + 1) ? "bg-brand text-brand-foreground" : "border border-border bg-surface",
                    )}
                  >
                    {nome}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Prazo pela</span>
            <select value={m.prazo_tipo} onChange={(e) => set("prazo_tipo", e.target.value as ModeloInput["prazo_tipo"])} className={campo}>
              <option value="AGENDA">Agenda da Receita</option>
              <option value="DIA_FIXO">Dia fixo do mês</option>
            </select>
          </label>
          {m.prazo_tipo === "AGENDA" ? (
            <label className="flex min-w-[320px] flex-1 flex-col gap-1">
              <span className={rotulo}>Obrigação</span>
              <select value={m.agenda_chave ?? ""} onChange={(e) => set("agenda_chave", e.target.value || null)} className={campo}>
                <option value="">—</option>
                {chaveForaDaLista && <option value={m.agenda_chave!}>{obrigacaoAtual ?? m.agenda_chave}</option>}
                {obrigacoes.map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {o.relevante ? "" : "· "}
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Dia do prazo legal</span>
              <input
                type="number"
                min={1}
                max={31}
                value={m.dia_prazo ?? ""}
                onChange={(e) => set("dia_prazo", e.target.value ? Number(e.target.value) : null)}
                className={cn(campo, "w-20")}
              />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Mês do prazo</span>
            <select value={m.mes_prazo_offset} onChange={(e) => set("mes_prazo_offset", Number(e.target.value))} className={campo}>
              <option value={0}>No próprio mês da competência</option>
              <option value={1}>Mês seguinte</option>
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <option key={n} value={n}>
                  {n} meses depois
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo} title="Vazio = usa a meta SOMA da obrigação (agenda) ou o próprio prazo">
              Meta SOMA (dia)
            </span>
            <input
              type="number"
              min={1}
              max={31}
              value={m.dia_meta ?? ""}
              onChange={(e) => set("dia_meta", e.target.value ? Number(e.target.value) : null)}
              placeholder={m.prazo_tipo === "AGENDA" ? "da agenda" : "—"}
              className={cn(campo, "w-24")}
            />
          </label>
        </div>
        <p className="text-xs text-foreground/50">
          Fim de semana antecipa para sexta. Pela agenda, a meta vazia usa a meta cadastrada em Metas da agenda tributária.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-foreground/70">A quem se aplica (vazio = todas)</legend>
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <span className={rotulo}>Pessoa</span>
            <select
              value={m.aplica_pessoa ?? ""}
              onChange={(e) => set("aplica_pessoa", (e.target.value || null) as ModeloInput["aplica_pessoa"])}
              className={campo}
            >
              <option value="">PF e PJ</option>
              <option value="PJ">Só PJ</option>
              <option value="PF">Só PF</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className={rotulo}>Regime</span>
            <div className="flex flex-wrap gap-1">
              {REGIMES.map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  onClick={() => set("aplica_regimes", toggle(m.aplica_regimes, r.valor))}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    m.aplica_regimes?.includes(r.valor) ? "bg-brand text-brand-foreground" : "border border-border bg-surface",
                  )}
                >
                  {r.rotulo}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={rotulo}>Folha de pagamento</span>
            <select
              value={m.aplica_folha == null ? "" : String(m.aplica_folha)}
              onChange={(e) => set("aplica_folha", e.target.value === "" ? null : e.target.value === "true")}
              className={campo}
            >
              <option value="">Indiferente</option>
              <option value="true">Só quem tem folha</option>
              <option value="false">Só quem não tem</option>
            </select>
          </div>
          <div className="flex min-w-[240px] flex-col gap-1">
            <span className={rotulo}>Municípios</span>
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {municipios.map((x) => (
                <button
                  key={x.codigo}
                  type="button"
                  onClick={() => set("aplica_municipios", toggle(m.aplica_municipios, x.codigo))}
                  className={cn(
                    "rounded px-2 py-1 text-xs",
                    m.aplica_municipios?.includes(x.codigo) ? "bg-brand text-brand-foreground" : "border border-border bg-surface",
                  )}
                >
                  {x.nome}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-foreground/50">
          &quot;Tem folha&quot; = folha maior que zero em algum dos 3 últimos meses (Fechamento › Folha). Para casos fora da regra,
          use as exceções por empresa abaixo.
        </p>
      </fieldset>

      <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-foreground/70">Conclusão automática da tarefa inteira</legend>
        <select
          value={m.fonte_automatica ?? ""}
          onChange={(e) => set("fonte_automatica", e.target.value || null)}
          className={cn(campo, "max-w-md")}
        >
          <option value="">Manual (ou pelas etapas)</option>
          {Object.entries(FONTES_ROTULO).map(([k, r]) => (
            <option key={k} value={k}>
              {r}
            </option>
          ))}
        </select>
        <p className="text-xs text-foreground/50">
          Use para tarefa sem etapas (ex.: EFD-Reinf ⇒ Reinf enviada). Com etapas, escolha a fonte em cada etapa.
        </p>
      </fieldset>

      {m.id ? (
        <EtapasEditor modeloId={m.id} iniciais={etapas} departamentos={departamentos} />
      ) : (
        <p className="text-xs text-foreground/50">Salve o modelo para cadastrar etapas e exceções.</p>
      )}

      {m.id && <Excecoes modeloId={m.id} empresas={empresas} excecoes={excecoes} />}

      <div className="flex flex-wrap items-center gap-2">
        <label className="mr-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={m.ativo} onChange={(e) => set("ativo", e.target.checked)} />
          Ativo (gera tarefas)
        </label>
        <button
          type="button"
          onClick={salvar}
          disabled={pendente}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button type="button" onClick={() => aoFechar()} className="rounded-lg border border-border px-4 py-1.5 text-sm">
          Cancelar
        </button>
        {m.id && (
          <button type="button" onClick={excluir} disabled={pendente} className="ml-auto text-xs text-danger underline">
            Excluir modelo
          </button>
        )}
        {erro && <div className="w-full text-sm text-danger">{erro}</div>}
      </div>
    </Card>
  );
}

function Excecoes({
  modeloId,
  empresas,
  excecoes,
}: {
  modeloId: string;
  empresas: Opcao[];
  excecoes: { company_id: string; tipo: "INCLUIR" | "EXCLUIR" }[];
}) {
  const [lista, setLista] = useState(excecoes);
  const [empresa, setEmpresa] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const nome = useMemo(() => new Map(empresas.map((e) => [e.id, e.nome])), [empresas]);

  const salvar = (companyId: string, tipo: "INCLUIR" | "EXCLUIR" | null) =>
    iniciar(async () => {
      const r = await salvarExcecaoAction({ modeloId, companyId, tipo });
      if ("error" in r) return setErro(r.error);
      setErro(null);
      setLista((l) => [...l.filter((x) => x.company_id !== companyId), ...(tipo ? [{ company_id: companyId, tipo }] : [])]);
      setEmpresa("");
    });

  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-foreground/70">Exceções por empresa</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="h-8 min-w-[280px] rounded-lg border border-border bg-surface px-2 text-sm">
          <option value="">Escolha a empresa…</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        <button type="button" disabled={!empresa || pendente} onClick={() => salvar(empresa, "INCLUIR")} className="rounded-lg border border-border px-2.5 py-1 text-xs disabled:opacity-50">
          Sempre incluir
        </button>
        <button type="button" disabled={!empresa || pendente} onClick={() => salvar(empresa, "EXCLUIR")} className="rounded-lg border border-border px-2.5 py-1 text-xs disabled:opacity-50">
          Nunca gerar
        </button>
      </div>
      {lista.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {lista.map((x) => (
            <li key={x.company_id} className="flex items-center gap-2">
              <span className={cn("rounded px-1.5 text-[11px] font-semibold", x.tipo === "INCLUIR" ? "bg-success-soft text-success" : "bg-rose-100 text-rose-800")}>
                {x.tipo === "INCLUIR" ? "Incluir" : "Nunca gerar"}
              </span>
              {nome.get(x.company_id) ?? x.company_id}
              <button type="button" disabled={pendente} onClick={() => salvar(x.company_id, null)} className="text-xs text-foreground/50 underline">
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <div className="text-xs text-danger">{erro}</div>}
    </fieldset>
  );
}
