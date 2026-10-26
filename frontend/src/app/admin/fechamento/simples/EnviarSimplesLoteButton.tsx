"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Empresa = { id: string; nome: string };
type Resumo = { sucessos: number; jaDeclaradas: string[]; falhas: { nome: string; erro: string }[] };

// Uma empresa por chamada (reaproveita a mesma rota do card individual,
// /integra-contador/simples/declarar) — mesmo padrão de
// EnviarMitLoteButton.tsx. Diferente do fluxo individual (que sempre
// simula antes de transmitir), o lote vai direto pra
// indicadorTransmissao:true — não existe simulação em lote, por isso o
// aviso de confirmação é mais explícito sobre isso.
//
// UMA tentativa por empresa, de propósito: transmissão tem efeito legal, e
// uma falha de rede pode ter acontecido DEPOIS da Serpro aceitar. Repetir
// às cegas arriscava declarar duas vezes. Quem falhar aparece na lista com
// o motivo; a rota recusa (409) uma segunda declaração original da mesma
// competência e também barra quem não passou na conferência.
export function EnviarSimplesLoteButton({ competencia, empresas }: { competencia: string; empresas: Empresa[] }) {
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [indice, setIndice] = useState(0);
  const [empresaAtual, setEmpresaAtual] = useState<string | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);

  async function rodar() {
    setRodando(true);
    setResumo(null);
    const parcial: Resumo = { sucessos: 0, jaDeclaradas: [], falhas: [] };

    for (let i = 0; i < empresas.length; i++) {
      const empresa = empresas[i];
      setIndice(i + 1);
      setEmpresaAtual(empresa.nome);

      try {
        const resposta = await fetch(`/admin/empresas/${empresa.id}/integra-contador/simples/declarar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ competencia, indicadorTransmissao: true, retificadora: false }),
        });
        const corpo = await resposta.json().catch(() => null);
        if (resposta.ok && corpo?.resultado?.idDeclaracao) parcial.sucessos += 1;
        else if (corpo?.jaDeclarada) parcial.jaDeclaradas.push(empresa.nome);
        else parcial.falhas.push({ nome: empresa.nome, erro: corpo?.error ?? `Erro ${resposta.status}` });
      } catch {
        parcial.falhas.push({
          nome: empresa.nome,
          erro: "Sem resposta do servidor — consulte o recibo antes de reenviar.",
        });
      }
    }

    setResumo(parcial);
    setEmpresaAtual(null);
    setRodando(false);
    setConfirmando(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {!confirmando && (
        <Button
          type="button"
          variant="danger"
          loading={rodando}
          onClick={() => setConfirmando(true)}
          disabled={empresas.length === 0}
        >
          Declarar e transmitir todas ({empresas.length})
        </Button>
      )}

      {confirmando && (
        <Alert tone="danger">
          <div className="flex flex-col gap-3">
            <span>
              Isso vai <strong>transmitir de verdade</strong> o PGDAS-D de{" "}
              <strong>{empresas.length} empresa(s)</strong> pra competência {competencia} — direto,
              sem simulação prévia por empresa, efeito legal real. Confirma?
            </span>
            <div className="flex gap-2">
              <Button variant="danger" loading={rodando} onClick={rodar}>
                Sim, transmitir todas
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
        <Alert tone={resumo.falhas.length === 0 ? "success" : "warning"}>
          {resumo.sucessos} empresa(s) declarada(s).
          {resumo.jaDeclaradas.length > 0 && (
            <span className="mt-1 block">
              {resumo.jaDeclaradas.length} já tinham declaração e foram puladas: {resumo.jaDeclaradas.join(", ")}.
            </span>
          )}
          {resumo.falhas.length > 0 && (
            <span className="mt-1 block">
              {resumo.falhas.length} não transmitida(s):
              <ul className="mt-1 list-disc pl-5">
                {resumo.falhas.map((f) => (
                  <li key={f.nome}>
                    <strong>{f.nome}</strong> — {f.erro}
                  </li>
                ))}
              </ul>
            </span>
          )}
        </Alert>
      )}
    </div>
  );
}
