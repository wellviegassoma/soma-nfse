"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cn } from "@/lib/cn";
import { SerenaAvatar } from "./SerenaAvatar";
import { NewtonAvatar } from "../newton/NewtonAvatar";
import {
  aplicarPropostaAction,
  descartarPropostaAction,
  historicoSerenaAction,
  propostaSerenaAction,
  type MensagemSerena,
  type PropostaSerena,
} from "@/lib/actions/serena-chat";

const TRATAMENTO: Record<string, string> = { ANEXO_III_FIXO: "Anexo III fixo", FATOR_R: "Fator R (III ou V)", ANEXO_IV_FIXO: "Anexo IV fixo" };
const ROTULO_FERRAMENTA: Record<string, string> = {
  resumoCarteira: "olhando a carteira",
  listarEmpresas: "listando empresas",
  detalheEmpresa: "abrindo a empresa",
  notasDaEmpresa: "lendo as notas",
  faturamentoPorMes: "somando o faturamento da carteira",
  conferirPrefeitura: "conferindo a prefeitura",
  auditarComIa: "auditando a apuração",
  servicosSemAtividade: "procurando serviços sem atividade",
  proporClassificacao: "preparando a proposta",
};
// O mesmo chat serve aos dois analistas de IA (Serena: Simples; Newton: Presumido).
type Analista = "SERENA" | "NEWTON";
const CONFIG = {
  SERENA: {
    nome: "Serena",
    artigo: "a",
    Avatar: SerenaAvatar,
    api: "/api/serena/chat",
    faixa: "from-violet-600 to-fuchsia-500",
    subtitulo: "Analista fiscal (IA) · Simples Nacional · Petrópolis e Rio",
    apresentacao:
      "Oi! Sou a Serena, a analista fiscal de IA da SOMA. Posso explicar onde cada empresa parou, rodar a conferência com a prefeitura, auditar a apuração e preparar correções para você confirmar. Transmitir PGDAS e mandar mensagem a cliente continuam nos botões da tela.",
    sugestoes: [
      "Como está o fechamento deste mês?",
      "Quais empresas estão bloqueadas e por quê?",
      "Classifique os serviços sem atividade do Simples",
      "Confira a prefeitura de quem falta em Petrópolis",
    ],
  },
  NEWTON: {
    nome: "Newton",
    artigo: "o",
    Avatar: NewtonAvatar,
    api: "/api/newton/chat",
    faixa: "from-sky-600 to-indigo-700",
    subtitulo: "Analista fiscal (IA) · Lucro Presumido · Petrópolis e Rio",
    apresentacao:
      "Oi! Sou o Newton, o analista fiscal de IA da SOMA para o Lucro Presumido. Posso explicar onde cada empresa parou, conferir a prefeitura e auditar a apuração de PIS, COFINS, IRPJ e CSLL. Encerrar o MIT, transmitir a DCTFWeb e mandar mensagem a cliente continuam nos botões da tela.",
    sugestoes: [
      "Como está o fechamento deste mês?",
      "Quais empresas estão bloqueadas e por quê?",
      "Quem tem equiparação hospitalar sem nota marcada?",
      "Confira a prefeitura de quem falta em Petrópolis",
    ],
  },
} as const;

function textoDe(m: UIMessage) {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Botão flutuante + aba lateral para conversar com a Serena (ou o Newton). */
export function SerenaChat({ analista = "SERENA" }: { analista?: Analista } = {}) {
  const cfg = CONFIG[analista];
  const Avatar = cfg.Avatar;
  const [aberto, setAberto] = useState(false);
  const [carregado, setCarregado] = useState<MensagemSerena[] | null>(null);

  useEffect(() => {
    if (!aberto || carregado) return;
    historicoSerenaAction(analista).then(setCarregado).catch(() => setCarregado([]));
  }, [aberto, carregado, analista]);

  return (
    <>
      {!aberto && (
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={`Falar com ${cfg.artigo} ${cfg.nome}`}
        aria-label={`Falar com ${cfg.artigo} ${cfg.nome}`}
        className={cn(
          "fixed right-5 bottom-5 z-40 flex h-16 w-16 items-center justify-center rounded-full shadow-xl ring-4 ring-white transition hover:scale-105",
          aberto ? "bg-foreground text-background" : "bg-transparent",
        )}
      >
        {aberto ? (
          <span className="text-2xl leading-none">×</span>
        ) : (
          <Avatar tamanho={64} />
        )}
      </button>
      )}
      {aberto && (
        <aside className="fixed top-0 right-0 bottom-0 z-30 flex w-full flex-col border-l border-border bg-background shadow-2xl sm:w-[460px]">
          <div className={cn("flex items-center gap-3 border-b border-border bg-gradient-to-r px-4 py-3 text-white", cfg.faixa)}>
            <Avatar tamanho={44} selo={false} className="rounded-full ring-2 ring-white/70" />
            <div className="flex-1">
              <div className="text-sm font-semibold">{cfg.nome}</div>
              <div className="text-[11px] text-white/80">{cfg.subtitulo}</div>
            </div>
            <button type="button" onClick={() => setAberto(false)} className="rounded px-2 text-xl leading-none" aria-label="Fechar">
              ×
            </button>
          </div>
          {carregado ? <Conversa historico={carregado} analista={analista} /> : <div className="p-4 text-sm text-foreground/60">Carregando a conversa…</div>}
        </aside>
      )}
    </>
  );
}

function Conversa({ historico, analista }: { historico: MensagemSerena[]; analista: Analista }) {
  const cfg = CONFIG[analista];
  const Avatar = cfg.Avatar;
  const [input, setInput] = useState("");
  const fim = useRef<HTMLDivElement>(null);
  const propostasDoHistorico = useMemo(() => new Map(historico.map((m) => [m.id, m.propostas])), [historico]);
  const { messages, sendMessage, status, error } = useChat({
    id: analista.toLowerCase(),
    messages: historico.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] }) as UIMessage),
    transport: new DefaultChatTransport({ api: cfg.api }),
  });
  const ocupada = status === "streaming" || status === "submitted";

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const enviar = (texto: string) => {
    const t = texto.trim();
    if (!t || ocupada) return;
    sendMessage({ text: t });
    setInput("");
  };

  return (
    <>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Avatar tamanho={56} />
              <div className="text-sm font-semibold">{cfg.nome}</div>
            </div>
            <p className="text-sm text-foreground/70">{cfg.apresentacao}</p>
            <div className="flex flex-wrap gap-1.5">
              {cfg.sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)} className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1 text-xs text-violet-900 hover:bg-violet-100">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const texto = textoDe(m);
          const ferramentas = m.parts.filter((p) => p.type.startsWith("tool-")) as unknown as { type: string; state?: string; output?: { propostaId?: string } }[];
          const propostaIdsAoVivo = ferramentas.map((f) => f.output?.propostaId).filter(Boolean) as string[];
          const doHistorico = propostasDoHistorico.get(m.id) ?? [];
          return (
            <div key={m.id} className={cn("flex flex-col gap-1.5", m.role === "user" ? "items-end" : "items-start")}>
              {m.role === "assistant" &&
                ferramentas
                  .filter((f) => f.state !== "output-available")
                  .map((f, i) => (
                    <span key={i} className="text-[11px] text-violet-700">
                      {cfg.nome} está {ROTULO_FERRAMENTA[f.type.replace("tool-", "")] ?? "trabalhando"}…
                    </span>
                  ))}
              {texto && (
                <div className={cn("flex max-w-full items-end gap-2", m.role === "user" ? "flex-row-reverse" : "")}>
                {m.role === "assistant" && <Avatar tamanho={28} selo={false} />}
                <div
                  className={cn(
                    "max-w-[92%] rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "user" ? "rounded-br-sm bg-brand text-brand-foreground" : "rounded-bl-sm bg-surface-muted text-foreground",
                  )}
                >
                  {m.role === "assistant" ? <Markdown texto={texto} /> : <span className="whitespace-pre-wrap">{texto}</span>}
                </div>
                </div>
              )}
              {doHistorico.map((p) => (
                <CartaoProposta key={p.id} inicial={p} />
              ))}
              {propostaIdsAoVivo.filter((id) => !doHistorico.some((p) => p.id === id)).map((id) => (
                <CartaoProposta key={id} propostaId={id} />
              ))}
            </div>
          );
        })}
        {ocupada && (
          <div className="flex items-center gap-2 text-xs text-foreground/50">
            <Avatar tamanho={22} selo={false} /> {cfg.nome} está pensando…
          </div>
        )}
        {error && <div className="text-xs text-danger">Não consegui responder agora. Tente de novo.</div>}
        <div ref={fim} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(input);
        }}
        className="flex items-end gap-2 border-t border-border p-3"
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(input);
            }
          }}
          rows={2}
          placeholder={`Fale com ${cfg.artigo} ${cfg.nome}…`}
          className="flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-violet-500"
        />
        <button type="submit" disabled={ocupada || !input.trim()} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">
          Enviar
        </button>
      </form>
    </>
  );
}

/** Cartão de confirmação: a Serena prepara, a pessoa escolhe e confirma. */
function CartaoProposta({ inicial, propostaId }: { inicial?: PropostaSerena; propostaId?: string }) {
  const router = useRouter();
  const [p, setP] = useState<PropostaSerena | null>(inicial ?? null);
  const [sel, setSel] = useState<Set<string>>(new Set(inicial?.itens.map((i) => i.id) ?? []));
  const [msg, setMsg] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    if (p || !propostaId) return;
    propostaSerenaAction(propostaId).then((r) => {
      setP(r);
      if (r) setSel(new Set(r.itens.map((i) => i.id)));
    });
  }, [p, propostaId]);

  if (!p) return <div className="text-xs text-foreground/50">Carregando a proposta…</div>;
  const decidida = p.status !== "PENDENTE";

  return (
    <div className="w-full rounded-xl border border-violet-300 bg-violet-50/60 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-violet-900">{p.titulo}</span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold",
            p.status === "APLICADA" ? "bg-emerald-100 text-emerald-800" : p.status === "DESCARTADA" ? "bg-surface-muted text-foreground/60" : "bg-amber-100 text-amber-900",
          )}
        >
          {p.status === "APLICADA" ? "Aplicada" : p.status === "DESCARTADA" ? "Descartada" : "Aguardando sua confirmação"}
        </span>
      </div>
      <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
        {p.itens.map((i) => (
          <li key={i.id} className="flex gap-2 rounded-lg bg-white/70 p-2">
            {!decidida && (
              <input
                type="checkbox"
                checked={sel.has(i.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(i.id);
                  else n.delete(i.id);
                  setSel(n);
                }}
                className="mt-0.5"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium text-foreground">
                {i.servico} {i.codigo && <span className="font-mono text-foreground/50">({i.codigo})</span>}
              </div>
              <div className="text-foreground/60">{i.empresa}</div>
              <div className="mt-0.5">
                → <span className="font-medium">{i.atividade.slice(0, 90)}</span>{" "}
                <span className="rounded bg-violet-100 px-1 text-violet-800">{TRATAMENTO[i.tratamento] ?? i.tratamento}</span>{" "}
                <span className="rounded bg-surface-muted px-1 text-foreground/60">{i.origem === "REGRA" ? "regra do sistema" : "sugestão da Serena"}</span>
              </div>
              <div className="text-foreground/55">
                {i.motivo} · {i.citacao}
              </div>
              {decidida && p.aplicados && <div className={p.aplicados.includes(i.id) ? "text-emerald-700" : "text-foreground/40"}>{p.aplicados.includes(i.id) ? "aplicado" : "não aplicado"}</div>}
            </div>
          </li>
        ))}
      </ul>
      {!decidida && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            disabled={pendente || sel.size === 0}
            onClick={() =>
              iniciar(async () => {
                const r = await aplicarPropostaAction({ propostaId: p.id, itemIds: [...sel] });
                if ("error" in r) return setMsg(r.error);
                setMsg(r.mensagem);
                setP(await propostaSerenaAction(p.id));
                router.refresh();
              })
            }
            className="rounded-lg bg-violet-600 px-3 py-1.5 font-medium text-white disabled:opacity-40"
          >
            Confirmar {sel.size}
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              iniciar(async () => {
                await descartarPropostaAction(p.id);
                setP(await propostaSerenaAction(p.id));
              })
            }
            className="rounded-lg border border-border bg-white px-3 py-1.5"
          >
            Descartar
          </button>
        </div>
      )}
      {msg && <div className="mt-1.5 text-foreground/70">{msg}</div>}
    </div>
  );
}

/** Markdown mínimo e seguro (sem HTML cru): **negrito**, listas e tabelas. */
function Negrito({ t }: { t: string }) {
  const partes = t.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {partes.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>))}
    </>
  );
}

function Markdown({ texto }: { texto: string }) {
  const linhas = texto.split("\n");
  const blocos: React.ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (l.trim().startsWith("|")) {
      const tab: string[][] = [];
      while (i < linhas.length && linhas[i].trim().startsWith("|")) {
        const cel = linhas[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cel.every((c) => /^:?-{2,}:?$/.test(c))) tab.push(cel);
        i++;
      }
      blocos.push(
        <table key={blocos.length} className="my-1 w-full border-collapse text-xs">
          <tbody>
            {tab.map((r, k) => (
              <tr key={k} className={k === 0 ? "font-semibold" : ""}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-border/60 px-1.5 py-0.5">
                    <Negrito t={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^\s*[-*] /.test(l)) {
      const itens: string[] = [];
      while (i < linhas.length && /^\s*[-*] /.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*[-*] /, ""));
      blocos.push(
        <ul key={blocos.length} className="my-1 list-disc space-y-0.5 pl-4">
          {itens.map((t, k) => (
            <li key={k}>
              <Negrito t={t} />
            </li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)] /.test(l)) {
      const itens: string[] = [];
      while (i < linhas.length && /^\s*\d+[.)] /.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*\d+[.)] /, ""));
      blocos.push(
        <ol key={blocos.length} className="my-1 list-decimal space-y-0.5 pl-4">
          {itens.map((t, k) => (
            <li key={k}>
              <Negrito t={t} />
            </li>
          ))}
        </ol>,
      );
      continue;
    }
    if (l.trim()) {
      blocos.push(
        <p key={blocos.length} className={cn("my-1", /^#+\s/.test(l) ? "font-semibold" : "")}>
          <Negrito t={l.replace(/^#+\s*/, "")} />
        </p>,
      );
    }
    i++;
  }
  return <div>{blocos}</div>;
}
