"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import type { ItemExecucao } from "@/lib/rotina-fechamento/itens";

function formatMoney(value: unknown) {
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Etapa 5 — mostra o resultado da última conferência (Etapa 4) e deixa
// escolher, empresa por empresa, quem emitir de verdade. Nunca dispara
// sozinho: exige confirmar:true no corpo da requisição (ver
// api/rotina-fechamento/iss-petropolis-emitir/route.ts) — cada emissão
// fecha o movimento econômico do mês na Prefeitura, ação real e só
// reversível por retificação.
export function EmitirPetropolisSelecao({
  competencia,
  itensConferencia,
}: {
  competencia: string;
  itensConferencia: ItemExecucao[];
}) {
  const pendentes = useMemo(
    () => itensConferencia.filter((i) => i.status !== "ERRO" && i.detalhes.consolidado === false),
    [itensConferencia],
  );

  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set(pendentes.map((i) => i.companyId)));
  const [confirmando, setConfirmando] = useState(false);
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ sucessos: number; erros: number } | null>(null);
  const router = useRouter();

  function alternar(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  async function emitir() {
    setPending(true);
    setErro(null);
    setResumo(null);
    try {
      const resp = await fetch("/api/rotina-fechamento/iss-petropolis-emitir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, companyIds: Array.from(selecionados), confirmar: true }),
      });
      const corpo = await resp.json();
      if (!resp.ok) {
        setErro(corpo?.error || "Não foi possível emitir as guias selecionadas.");
        return;
      }
      setResumo({ sucessos: corpo.sucessos, erros: corpo.erros });
      setConfirmando(false);
      router.refresh();
    } catch {
      setErro("Não foi possível emitir as guias selecionadas.");
    } finally {
      setPending(false);
    }
  }

  if (itensConferencia.length === 0) {
    return (
      <p className="text-xs text-foreground/50">
        Rode a Etapa 4 (conferir) primeiro pra ver quem tem período ainda não consolidado.
      </p>
    );
  }

  if (pendentes.length === 0) {
    return <p className="text-xs text-foreground/50">Ninguém com período pendente na última conferência.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-muted text-xs text-foreground/50">
            <tr>
              <th className="px-3 py-2 text-center">
                <input
                  type="checkbox"
                  checked={selecionados.size === pendentes.length}
                  onChange={() =>
                    setSelecionados(
                      selecionados.size === pendentes.length ? new Set() : new Set(pendentes.map((i) => i.companyId)),
                    )
                  }
                />
              </th>
              <th className="px-3 py-2 text-left">Empresa</th>
              <th className="px-3 py-2 text-right">Valor de serviços</th>
              <th className="px-3 py-2 text-right">Faturamento SOMA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pendentes.map((item) => (
              <tr key={item.companyId}>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={selecionados.has(item.companyId)}
                    onChange={() => alternar(item.companyId)}
                  />
                </td>
                <td className="px-3 py-2">{item.nome}</td>
                <td className="px-3 py-2 text-right">{formatMoney(item.detalhes.valorServicos)}</td>
                <td className="px-3 py-2 text-right">{formatMoney(item.detalhes.faturamentoSoma)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!confirmando && (
        <Button
          type="button"
          variant="danger"
          disabled={selecionados.size === 0}
          onClick={() => setConfirmando(true)}
        >
          Emitir guia real de {selecionados.size} empresa(s)
        </Button>
      )}

      {confirmando && (
        <Alert tone="danger">
          <div className="flex flex-col gap-3">
            <span>
              Isso <strong>fecha o movimento econômico do mês</strong> de {selecionados.size} empresa(s) na
              Prefeitura de Petrópolis e emite a guia — real, só reversível por retificação. Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="danger" loading={pending} onClick={emitir}>
                Sim, emitir de verdade
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {erro && <Alert tone="danger">{erro}</Alert>}
      {resumo && (
        <Alert tone={resumo.erros > 0 ? "warning" : "success"}>
          {resumo.sucessos} guia(s) emitida(s){resumo.erros ? `, ${resumo.erros} com erro` : ""}.
        </Alert>
      )}
    </div>
  );
}
