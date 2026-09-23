"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";

type ContatoWhatsapp = { jid: string; nome: string | null; telefone: string | null };

export function NovaConversaModal({
  departamentos,
}: {
  departamentos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const digitosBusca = busca.replace(/\D/g, "");
  const [resultados, setResultados] = useState<ContatoWhatsapp[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState<ContatoWhatsapp | null>(null);
  const [departamentoId, setDepartamentoId] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca com debounce — evita bater na API a cada tecla digitada.
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (busca.trim().length < 2) {
      return;
    }
    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      const resposta = await fetch(`/api/atendimento/contatos-whatsapp?q=${encodeURIComponent(busca.trim())}`);
      const dados = await resposta.json();
      setBuscando(false);
      setResultados(dados.contatos ?? []);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [busca]);

  function fechar() {
    setAberto(false);
    setBusca("");
    setResultados([]);
    setSelecionado(null);
    setDepartamentoId("");
    setMensagem("");
    setErro(null);
  }

  async function iniciar() {
    if (!selecionado || !departamentoId || !mensagem.trim()) {
      setErro("Escolha o contato, o departamento e escreva a primeira mensagem.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const resposta = await fetch("/api/atendimento/tickets/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jid: selecionado.jid,
        nome: selecionado.nome,
        telefone: selecionado.telefone,
        departamento_id: departamentoId,
        corpo: mensagem.trim(),
      }),
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.error || "Falha ao iniciar a conversa.");
      return;
    }
    fechar();
    router.push(`/atendimento/${dados.ticket_id}`);
  }

  if (!aberto) {
    return (
      <Button size="md" onClick={() => setAberto(true)}>
        + Nova conversa
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground">Nova conversa</h2>

        {!selecionado ? (
          <div className="mt-4 space-y-2">
            <Input
              autoFocus
              placeholder="Buscar contato por nome ou número..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {buscando && <p className="p-3 text-sm text-foreground/50">Buscando...</p>}
              {!buscando && busca.trim().length >= 2 && resultados.length === 0 && (
                <p className="p-3 text-sm text-foreground/50">Nenhum contato encontrado.</p>
              )}
              {busca.trim().length < 2 && (
                <p className="p-3 text-sm text-foreground/50">Digite ao menos 2 letras pra buscar.</p>
              )}
              {busca.trim().length >= 2 && resultados.map((c) => (
                <button
                  key={c.jid}
                  type="button"
                  onClick={() => setSelecionado(c)}
                  className="block w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted"
                >
                  <div className="font-medium text-foreground">{c.nome || "Sem nome"}</div>
                  <div className="text-xs text-foreground/50">{c.telefone}</div>
                </button>
              ))}
            </div>
            {digitosBusca.length >= 8 && (
              <button
                type="button"
                onClick={() =>
                  setSelecionado({ jid: `${digitosBusca}@s.whatsapp.net`, nome: null, telefone: digitosBusca })
                }
                className="w-full rounded-lg border border-dashed border-border px-3 py-2 text-left text-sm text-brand hover:bg-surface-muted"
              >
                Iniciar com o número {digitosBusca} (fora da agenda sincronizada)
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-border bg-surface-muted px-3 py-2">
              <div className="text-sm font-medium text-foreground">{selecionado.nome || "Sem nome"}</div>
              <div className="text-xs text-foreground/50">{selecionado.telefone}</div>
              <button
                type="button"
                onClick={() => setSelecionado(null)}
                className="mt-1 text-xs text-brand underline"
              >
                Trocar contato
              </button>
            </div>
            <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
              <option value="">Departamento...</option>
              {departamentos.map((dep) => (
                <option key={dep.id} value={dep.id}>
                  {dep.nome}
                </option>
              ))}
            </Select>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Primeira mensagem..."
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </div>
        )}

        {erro && (
          <div className="mt-3">
            <Alert>{erro}</Alert>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={fechar} disabled={enviando}>
            Cancelar
          </Button>
          {selecionado && (
            <Button onClick={iniciar} loading={enviando}>
              Iniciar conversa
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
