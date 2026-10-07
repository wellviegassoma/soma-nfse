"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { conferirPrefeituraPetropolis } from "@/lib/actions/conferencia-prefeitura";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type UltimaConferencia = { valor: number | null; erro: string | null; consultadoEm: string };

// Só leitura — consulta o faturamento do mês no ISS de Petrópolis e compara
// com o total das notas importadas. Nunca consolida nem gera guia.
export function ConferirPrefeituraCard({
  companyId,
  competencia,
  faturamentoNotas,
  ultima,
}: {
  companyId: string;
  competencia: string;
  faturamentoNotas: number;
  ultima: UltimaConferencia | null;
}) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function conferir() {
    setCarregando(true);
    setErro(null);
    try {
      const r = await conferirPrefeituraPetropolis(companyId, competencia);
      if (!r.ok) setErro(r.erro ?? "Não foi possível consultar a prefeitura.");
      router.refresh();
    } catch {
      setErro("Falha de rede ao consultar a prefeitura. Tente novamente.");
    } finally {
      setCarregando(false);
    }
  }

  const valorPrefeitura = ultima && ultima.valor != null ? ultima.valor : null;
  const diferenca = valorPrefeitura != null ? valorPrefeitura - faturamentoNotas : null;
  const bate = diferenca != null && Math.abs(diferenca) < 0.01;
  const quando = ultima
    ? new Date(ultima.consultadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-foreground/70">Conferência com a Prefeitura de Petrópolis</div>
          <p className="mt-1 text-xs text-foreground/50">
            Compara o faturamento do mês no site do ISS com o das notas importadas. Só consulta — não
            consolida o período nem gera guia.
          </p>
        </div>
        <Button variant="secondary" loading={carregando} onClick={conferir}>
          Conferir agora
        </Button>
      </div>

      {erro && (
        <div className="mt-4">
          <Alert tone="danger">{erro}</Alert>
        </div>
      )}

      {ultima && (
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs text-foreground/50">Notas importadas</div>
            <div className="font-semibold">{formatMoney(faturamentoNotas)}</div>
          </div>
          <div>
            <div className="text-xs text-foreground/50">Prefeitura</div>
            <div className="font-semibold">{valorPrefeitura != null ? formatMoney(valorPrefeitura) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-foreground/50">Resultado</div>
            {valorPrefeitura == null ? (
              <div className="font-semibold text-danger">Sem acesso: {ultima.erro}</div>
            ) : bate ? (
              <div className="font-semibold text-success">Bate</div>
            ) : (
              <div className="font-semibold text-danger">Diferença de {formatMoney(diferenca!)}</div>
            )}
          </div>
          <div className="text-xs text-foreground/40 sm:col-span-3">Última consulta: {quando}</div>
        </div>
      )}
    </Card>
  );
}
