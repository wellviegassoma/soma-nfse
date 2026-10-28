"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { periodoLegivel } from "@/lib/fgts-periodo";

// Custo aproximado por consulta na Infosimples (base R$ 0,20 + adicional
// R$ 0,08) — só pra estimativa no aviso de confirmação.
const CUSTO_POR_CONSULTA = 0.28;

type Empresa = { id: string; nome: string };

function moeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Mesmo padrão de ConsultarSituacaoFiscalLoteButton.tsx (uma chamada por
// vez), mas SEM retry automático: cada tentativa é uma consulta paga na
// Infosimples. Cada empresa é consultada em cada competência pedida — a
// Infosimples só traz um período por chamada, então N meses = N chamadas
// por empresa.
export function ConsultarFgtsLoteButton({ empresas, periodos }: { empresas: Empresa[]; periodos: string[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [atual, setAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{
    sucessos: number;
    comAberto: number;
    falhas: { nome: string; motivo: string }[];
    interrompido: { motivo: string; restantes: number } | null;
  } | null>(null);

  const total = empresas.length * periodos.length;
  const descricaoPeriodos =
    periodos.length === 1
      ? `a competência ${periodoLegivel(periodos[0])}`
      : `${periodos.length} competências (${periodoLegivel(periodos[periodos.length - 1])} a ${periodoLegivel(periodos[0])})`;

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let sucessos = 0;
    let comAberto = 0;
    const falhas: { nome: string; motivo: string }[] = [];
    let interrompido: { motivo: string; restantes: number } | null = null;

    let feitas = 0;
    lote: for (const empresa of empresas) {
      for (const periodo of periodos) {
        feitas += 1;
        setIndice(feitas);
        setAtual(`${empresa.nome} — ${periodoLegivel(periodo)}`);
        const rotulo = periodos.length > 1 ? `${empresa.nome} (${periodoLegivel(periodo)})` : empresa.nome;
        try {
          const resposta = await fetch(`/admin/empresas/${empresa.id}/fgts?periodo=${periodo}`, { method: "POST" });
          const corpo = await resposta.json().catch(() => null);
          if (resposta.ok) {
            sucessos += 1;
            if (corpo?.qtdEmAberto > 0) comAberto += 1;
          } else {
            const motivo: string = corpo?.error ?? `HTTP ${resposta.status}`;
            // 603 = a conta não pode usar a consulta (saldo acabou ou serviço
            // não habilitado) — vale pra todas as consultas seguintes também,
            // então para o lote em vez de repetir o mesmo erro em cada uma.
            if (motivo.startsWith("Infosimples 603")) {
              interrompido = { motivo, restantes: total - feitas + 1 };
              break lote;
            }
            falhas.push({ nome: rotulo, motivo });
          }
        } catch {
          falhas.push({ nome: rotulo, motivo: "falha de rede ao chamar o servidor" });
        }
      }
    }

    setResumo({ sucessos, comAberto, falhas, interrompido });
    setAtual(null);
    setRodando(false);
    setConfirmando(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button
          type="button"
          variant="primary"
          loading={rodando}
          onClick={() => setConfirmando(true)}
          disabled={total === 0}
        >
          Consultar FGTS das selecionadas ({empresas.length}
          {periodos.length > 1 ? ` × ${periodos.length} meses` : ""})
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai consultar as guias de FGTS de <strong>{empresas.length} empresa(s)</strong> em{" "}
              {descricaoPeriodos} — <strong>{total} consulta(s)</strong> na Infosimples, custo estimado de{" "}
              <strong>{moeda(total * CUSTO_POR_CONSULTA)}</strong> (franquia mínima de R$ 100/mês)
              {total > 200 && <>. Cada consulta leva de 10 a 20 segundos — deixe a aba aberta</>}. Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="primary" loading={rodando} onClick={rodar}>
                Sim, consultar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alert>
      )}

      {rodando && (
        <p className="text-xs text-foreground/60">
          {indice}/{total} — {atual}
        </p>
      )}

      {resumo && (
        <Alert tone={resumo.falhas.length === 0 && !resumo.interrompido ? "success" : "warning"}>
          {resumo.sucessos} consulta(s) feita(s), {resumo.comAberto} com guia em aberto.
          {resumo.interrompido && (
            <span className="mt-1 block">
              <strong>Lote interrompido</strong> — {resumo.interrompido.restantes} consulta(s) não foram feitas porque a
              Infosimples recusou a conta: <strong>{resumo.interrompido.motivo}</strong>
            </span>
          )}
          {resumo.falhas.length > 0 && (
            <span className="mt-1 block">
              {resumo.falhas.length} com erro:
              {Object.entries(
                resumo.falhas.reduce<Record<string, string[]>>((acc, f) => {
                  (acc[f.motivo] ??= []).push(f.nome);
                  return acc;
                }, {}),
              ).map(([motivo, nomes]) => (
                <span key={motivo} className="mt-2 block">
                  <strong>{motivo}</strong> ({nomes.length}): {nomes.join(", ")}.
                </span>
              ))}
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
