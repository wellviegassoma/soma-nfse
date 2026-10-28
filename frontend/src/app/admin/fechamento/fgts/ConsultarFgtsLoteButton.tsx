"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

// Custo aproximado por consulta na Infosimples (base R$ 0,20 + adicional
// R$ 0,08) — só pra estimativa no aviso de confirmação.
const CUSTO_POR_CONSULTA = 0.28;

type Empresa = { id: string; nome: string };

// Mesmo padrão de ConsultarSituacaoFiscalLoteButton.tsx (uma empresa por
// chamada), mas SEM retry automático: cada tentativa é uma consulta paga
// na Infosimples, e erro aqui costuma ser falta de procuração — repetir
// não resolve e só cobra de novo.
export function ConsultarFgtsLoteButton({ empresas }: { empresas: Empresa[] }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{
    sucessos: number;
    comAberto: number;
    falhas: { nome: string; motivo: string }[];
    interrompido: { motivo: string; restantes: number } | null;
  } | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    let sucessos = 0;
    let comAberto = 0;
    const falhas: { nome: string; motivo: string }[] = [];
    let interrompido: { motivo: string; restantes: number } | null = null;

    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);
      try {
        const resposta = await fetch(`/admin/empresas/${empresa.id}/fgts`, { method: "POST" });
        const corpo = await resposta.json().catch(() => null);
        if (resposta.ok) {
          sucessos += 1;
          if (corpo?.qtdEmAberto > 0) comAberto += 1;
        } else {
          const motivo: string = corpo?.error ?? `HTTP ${resposta.status}`;
          // 603 = a conta não pode usar a consulta (saldo acabou ou serviço
          // não habilitado) — vale pra todas as empresas seguintes também,
          // então para o lote em vez de repetir o mesmo erro em cada uma.
          if (motivo.startsWith("Infosimples 603")) {
            interrompido = { motivo, restantes: empresas.length - i };
            break;
          }
          falhas.push({ nome: empresa.nome, motivo });
        }
      } catch {
        falhas.push({ nome: empresa.nome, motivo: "falha de rede ao chamar o servidor" });
      }
    }

    setResumo({ sucessos, comAberto, falhas, interrompido });
    setEmpresaAtual(null);
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
          disabled={empresas.length === 0}
        >
          Consultar FGTS das selecionadas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="warning">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai consultar as guias de FGTS de <strong>{empresas.length} empresa(s)</strong> na
              Infosimples — custo estimado de{" "}
              <strong>
                {(empresas.length * CUSTO_POR_CONSULTA).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </strong>{" "}
              (dentro da franquia mínima de R$ 100/mês). Confirma?
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
          {indice}/{empresas.length} — {empresaAtual}
        </p>
      )}

      {resumo && (
        <Alert tone={resumo.falhas.length === 0 && !resumo.interrompido ? "success" : "warning"}>
          {resumo.sucessos} empresa(s) consultada(s), {resumo.comAberto} com guia em aberto.
          {resumo.interrompido && (
            <span className="mt-1 block">
              <strong>Lote interrompido</strong> — {resumo.interrompido.restantes} empresa(s) não foram consultadas porque a Infosimples recusou a
              conta: <strong>{resumo.interrompido.motivo}</strong>
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
