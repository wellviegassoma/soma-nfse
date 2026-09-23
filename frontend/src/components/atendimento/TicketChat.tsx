"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { cn } from "@/lib/cn";
import { useAtendimentoRealtime } from "@/lib/atendimento/useRealtimeChannel";
import type { Mensagem, TicketDetalhe } from "@/lib/atendimento/types";

export function TicketChat({
  ticket,
  mensagensIniciais,
  departamentos,
  nomesAtendentes,
  assuntos,
  atendentesPorDepartamento,
  todosAtendentes,
}: {
  ticket: TicketDetalhe;
  mensagensIniciais: Mensagem[];
  departamentos: { id: string; nome: string }[];
  nomesAtendentes: Record<string, string>;
  assuntos: { id: string; nome: string }[];
  atendentesPorDepartamento: Record<string, { id: string; nome: string }[]>;
  todosAtendentes: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const [interno, setInterno] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarTransferencia, setMostrarTransferencia] = useState(false);
  const [mostrarFechar, setMostrarFechar] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useAtendimentoRealtime<Mensagem>(
    `atendimento-ticket-${ticket.id}`,
    { event: "INSERT", table: "atendimento_mensagens", filter: `ticket_id=eq.${ticket.id}` },
    (payload) => {
      const nova = payload.new as Mensagem;
      setMensagens((atuais) => (atuais.some((m) => m.id === nova.id) ? atuais : [...atuais, nova]));
    },
  );

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  async function enviar() {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    setErro(null);
    const resposta = await fetch("/api/atendimento/mensagens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket_id: ticket.id, corpo: texto.trim(), interno }),
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.error || "Falha ao enviar mensagem.");
      return;
    }
    setTexto("");
  }

  async function assumir() {
    await fetch(`/api/atendimento/tickets/${ticket.id}/assumir`, { method: "POST" });
    router.refresh();
  }

  const empresa = ticket.contato?.company;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-foreground">
              {ticket.contato?.nome || ticket.contato?.telefone}
            </span>
            <span className="shrink-0 text-xs text-foreground/45">{ticket.protocolo}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground/55">
            <span>{ticket.contato?.telefone}</span>
            {empresa && (
              <Link href={`/admin/empresas/${empresa.id}`} className="text-brand underline">
                {empresa.trade_name || empresa.legal_name}
              </Link>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {ticket.status === "FILA" && (
            <Button size="md" variant="secondary" onClick={assumir}>
              Assumir
            </Button>
          )}
          {ticket.status !== "FECHADO" && (
            <>
              <Button size="md" variant="secondary" onClick={() => setMostrarTransferencia((v) => !v)}>
                Transferir
              </Button>
              <Button size="md" variant="secondary" onClick={() => setMostrarFechar(true)}>
                Fechar
              </Button>
            </>
          )}
        </div>
      </div>

      {mostrarTransferencia && (
        <TransferenciaForm
          ticketId={ticket.id}
          departamentos={departamentos}
          atendentesPorDepartamento={atendentesPorDepartamento}
          todosAtendentes={todosAtendentes}
          onConcluido={() => {
            setMostrarTransferencia(false);
            router.refresh();
          }}
        />
      )}

      {mostrarFechar && (
        <FecharModal
          ticketId={ticket.id}
          assuntos={assuntos}
          onCancelar={() => setMostrarFechar(false)}
          onConcluido={() => {
            setMostrarFechar(false);
            router.refresh();
          }}
        />
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {mensagens.map((mensagem) => (
          <MensagemBolha key={mensagem.id} mensagem={mensagem} nomesAtendentes={nomesAtendentes} />
        ))}
        <div ref={fimRef} />
      </div>

      {erro && (
        <div className="px-4 pb-2">
          <Alert>{erro}</Alert>
        </div>
      )}

      {ticket.status === "FECHADO" ? (
        <div className="border-t border-border px-4 py-3 text-center text-sm text-foreground/50">
          Chamado fechado.
        </div>
      ) : (
        <div className="border-t border-border p-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviar();
              }
            }}
            placeholder={interno ? "Nota interna (não vai pro cliente)..." : "Digite uma mensagem..."}
            rows={2}
            className={cn(
              "w-full resize-none rounded-lg border px-3.5 py-2.5 text-[15px] outline-none focus:ring-4",
              interno
                ? "border-warning/40 bg-warning-soft focus:ring-warning/15"
                : "border-border bg-surface focus:border-brand focus:ring-brand/15",
            )}
          />
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-foreground/60">
              <input
                type="checkbox"
                checked={interno}
                onChange={(e) => setInterno(e.target.checked)}
              />
              Nota interna
            </label>
            <Button onClick={enviar} loading={enviando} disabled={!texto.trim()}>
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MensagemBolha({
  mensagem,
  nomesAtendentes,
}: {
  mensagem: Mensagem;
  nomesAtendentes: Record<string, string>;
}) {
  if (mensagem.remetente_tipo === "SISTEMA") {
    return <div className="py-1 text-center text-xs text-foreground/45">{mensagem.corpo}</div>;
  }

  // O join só vem na carga inicial (Server Component); mensagem chegada
  // via Realtime cai no mapa de nomes buscado à parte — ver
  // app/atendimento/[ticketId]/page.tsx. ATENDENTE sem atendente_id é
  // mensagem mandada direto do celular vinculado, fora do app (ver
  // whatsapp-connector/src/baileys.js) — não dá pra saber quem foi.
  const nomeAtendente = mensagem.atendente_id
    ? mensagem.atendente?.full_name || nomesAtendentes[mensagem.atendente_id] || "Atendente"
    : mensagem.remetente_tipo === "ATENDENTE"
      ? "Enviado pelo celular"
      : null;

  if (mensagem.interno) {
    return (
      <div className="mx-auto max-w-[85%] rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-foreground">
        {nomeAtendente && (
          <div className="mb-0.5 text-xs font-medium text-warning">{nomeAtendente} · nota interna</div>
        )}
        {mensagem.corpo}
      </div>
    );
  }

  const doAtendente = mensagem.remetente_tipo === "ATENDENTE" || mensagem.remetente_tipo === "BOT";

  return (
    <div className={cn("flex", doAtendente ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-3 py-2 text-sm",
          doAtendente ? "bg-brand text-brand-foreground" : "border border-border bg-surface text-foreground",
        )}
      >
        {doAtendente && nomeAtendente && (
          <div className="mb-0.5 text-xs font-medium text-brand-foreground/70">{nomeAtendente}</div>
        )}
        {mensagem.corpo}
        <VisualizadorMidia mensagem={mensagem} />
      </div>
    </div>
  );
}

// midia_url só vem preenchido quando o whatsapp-connector conseguiu
// baixar e guardar o arquivo no Blob — sem isso, o rótulo em `corpo`
// (ex.: "[Imagem]") já é a única informação disponível, mostrado sozinho.
function VisualizadorMidia({ mensagem }: { mensagem: Mensagem }) {
  if (!mensagem.midia_url) return null;
  const src = `/api/atendimento/midia/${mensagem.id}`;

  if (mensagem.midia_tipo === "image" || mensagem.midia_tipo === "sticker") {
    // eslint-disable-next-line @next/next/no-img-element -- vem de rota própria autenticada, não vale otimização de imagem remota
    return <img src={src} alt="Mídia recebida" className="mt-1.5 max-h-72 rounded-md" />;
  }
  if (mensagem.midia_tipo === "video") {
    return <video controls src={src} className="mt-1.5 max-h-72 rounded-md" />;
  }
  if (mensagem.midia_tipo === "audio") {
    return <audio controls src={src} className="mt-1.5 max-w-full" />;
  }
  if (mensagem.midia_tipo === "document") {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="mt-1.5 inline-block text-sm underline underline-offset-2"
      >
        Abrir arquivo
      </a>
    );
  }
  return null;
}

function TransferenciaForm({
  ticketId,
  departamentos,
  atendentesPorDepartamento,
  todosAtendentes,
  onConcluido,
}: {
  ticketId: string;
  departamentos: { id: string; nome: string }[];
  atendentesPorDepartamento: Record<string, { id: string; nome: string }[]>;
  todosAtendentes: { id: string; nome: string }[];
  onConcluido: () => void;
}) {
  const [departamentoId, setDepartamentoId] = useState("");
  const [atendenteId, setAtendenteId] = useState("");
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Sem ninguém cadastrado nesse departamento (ver
  // atendimento_usuario_departamentos — gerenciável só por Supabase
  // Studio por enquanto), cai pra mostrar todo mundo em vez de um
  // seletor vazio.
  const atendentesDisponiveis = departamentoId
    ? atendentesPorDepartamento[departamentoId]?.length
      ? atendentesPorDepartamento[departamentoId]
      : todosAtendentes
    : [];

  async function confirmar() {
    if (!departamentoId || !comentario.trim()) {
      setErro("Selecione o departamento e escreva um comentário.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const resposta = await fetch(`/api/atendimento/tickets/${ticketId}/transferir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        departamento_id: departamentoId,
        atendente_id: atendenteId || null,
        comentario: comentario.trim(),
      }),
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.error || "Falha ao transferir.");
      return;
    }
    onConcluido();
  }

  return (
    <div className="space-y-2 border-b border-border bg-surface-muted px-4 py-3">
      <Select
        value={departamentoId}
        onChange={(e) => {
          setDepartamentoId(e.target.value);
          setAtendenteId("");
        }}
      >
        <option value="">Transferir para departamento...</option>
        {departamentos.map((dep) => (
          <option key={dep.id} value={dep.id}>
            {dep.nome}
          </option>
        ))}
      </Select>
      {departamentoId && (
        <Select value={atendenteId} onChange={(e) => setAtendenteId(e.target.value)}>
          <option value="">Transferir para atendente (opcional)</option>
          {atendentesDisponiveis.map((at) => (
            <option key={at.id} value={at.id}>
              {at.nome}
            </option>
          ))}
        </Select>
      )}
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder="Comentário obrigatório: dê contexto pra quem for atender."
        rows={2}
        className="w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
      />
      {erro && <Alert>{erro}</Alert>}
      <Button size="md" onClick={confirmar} loading={enviando}>
        Confirmar transferência
      </Button>
    </div>
  );
}

function FecharModal({
  ticketId,
  assuntos,
  onCancelar,
  onConcluido,
}: {
  ticketId: string;
  assuntos: { id: string; nome: string }[];
  onCancelar: () => void;
  onConcluido: () => void;
}) {
  const [assuntoId, setAssuntoId] = useState("");
  const [resumo, setResumo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    const resposta = await fetch(`/api/atendimento/tickets/${ticketId}/fechar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assunto_id: assuntoId || null, resumo }),
    });
    setEnviando(false);
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      setErro(dados.error || "Falha ao fechar o chamado.");
      return;
    }
    onConcluido();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 text-center shadow-lg">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border-2 border-warning text-2xl font-bold text-warning">
          !
        </div>
        <h2 className="text-lg font-semibold text-foreground">Fechar chamado</h2>
        <p className="mt-1 text-sm text-foreground/55">Você tem certeza que deseja fechar o chamado?</p>

        <div className="mt-4 space-y-3 text-left">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/60">Assunto do chamado</label>
            <Select value={assuntoId} onChange={(e) => setAssuntoId(e.target.value)}>
              <option value="">Selecione...</option>
              {assuntos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground/60">Resumo do atendimento</label>
            <textarea
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              placeholder="Resumo do atendimento"
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </div>
          {erro && <Alert>{erro}</Alert>}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} loading={enviando}>
            Fechar chamado
          </Button>
        </div>
      </div>
    </div>
  );
}
