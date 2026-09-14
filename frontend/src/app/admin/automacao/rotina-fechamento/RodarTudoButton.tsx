"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Passo = { label: string; endpoint: string };

const PASSOS: Passo[] = [
  { label: "Etapa 2/3 — ISS Rio de Janeiro", endpoint: "/api/rotina-fechamento/iss-rj" },
  { label: "Etapa 4 — Conferir ISS Petrópolis", endpoint: "/api/rotina-fechamento/iss-petropolis-conferir" },
];

// "Rodar tudo" cobre só as etapas 2-4 em sequência — a 1 (buscar notas)
// e a 6 (ver elegíveis pra fechar) ficam de botão próprio no mesmo
// painel (são rápidas e o operador normalmente já sabe se precisa
// rodar), e a 5 (emitir Petrópolis) NUNCA entra aqui: sempre para
// depois da 4 esperando confirmação explícita, empresa por empresa (ver
// EmitirPetropolisSelecao.tsx) — mesma trava que já existe rodando cada
// etapa separada, só que em sequência.
export function RodarTudoButton({ competencia }: { competencia: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [passoAtual, setPassoAtual] = useState<string | null>(null);
  const [resultados, setResultados] = useState<{ label: string; texto: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function rodar() {
    setRodando(true);
    setErro(null);
    setResultados([]);
    for (const passo of PASSOS) {
      setPassoAtual(passo.label);
      try {
        const resp = await fetch(`${passo.endpoint}?competencia=${competencia}`);
        const corpo = await resp.json();
        if (!resp.ok) {
          setErro(`${passo.label}: ${corpo?.error || "falhou"}`);
          setRodando(false);
          setPassoAtual(null);
          return;
        }
        const texto = `${corpo.sucessos}/${corpo.total} ok${corpo.divergencias ? `, ${corpo.divergencias} divergência(s)` : ""}${corpo.erros ? `, ${corpo.erros} erro(s)` : ""}`;
        setResultados((atual) => [...atual, { label: passo.label, texto }]);
      } catch {
        setErro(`${passo.label}: não foi possível rodar agora.`);
        setRodando(false);
        setPassoAtual(null);
        return;
      }
    }
    setPassoAtual(null);
    setRodando(false);
    setConfirmando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button type="button" loading={rodando} onClick={() => setConfirmando(true)}>
          Rodar tudo (Etapas 2-4)
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex flex-col gap-3">
            <span>
              Roda ISS do Rio de Janeiro e conferência de Petrópolis em sequência pra{" "}
              <strong>todas as empresas</strong>. A busca de guia do Rio pode <strong>emitir uma guia real</strong>{" "}
              se ainda não existir pra alguma competência — só clique se quiser isso pra todo mundo agora. Para
              antes da Etapa 5 (emitir Petrópolis), que continua exigindo confirmação separada.
            </span>
            <div className="flex gap-2">
              <Button loading={rodando} onClick={rodar}>
                Sim, rodar Etapas 2-4
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={rodando}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {passoAtual && <p className="text-xs text-foreground/60">Rodando: {passoAtual}...</p>}
      {erro && <Alert tone="danger">{erro}</Alert>}
      {resultados.length > 0 && (
        <Alert tone="success">
          <div className="flex flex-col gap-1">
            {resultados.map((r) => (
              <div key={r.label}>
                {r.label}: {r.texto}
              </div>
            ))}
            <div className="mt-1 text-xs">
              Confira a Etapa 5 abaixo pra decidir quem emitir de verdade em Petrópolis.
            </div>
          </div>
        </Alert>
      )}
    </div>
  );
}
