"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

type Empresa = { id: string; nome: string };

// Etapa 6 da Rotina de Fechamento — só grava um registro interno (não
// cria nada numa Prefeitura, não bloqueia edição de notas depois), por
// isso uma chamada só em lote basta, diferente do envio de PGDAS-D
// (EnviarSimplesLoteButton) que precisa de uma chamada por empresa.
export function FecharAntecipadoLoteButton({
  competencia,
  empresas,
}: {
  competencia: string;
  empresas: Empresa[];
}) {
  const [pending, setPending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ fechadas: number } | null>(null);

  async function fechar() {
    setPending(true);
    setErro(null);
    setResumo(null);
    try {
      const resp = await fetch("/api/rotina-fechamento/fechar-antecipado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ competencia, companyIds: empresas.map((e) => e.id) }),
      });
      const corpo = await resp.json();
      if (!resp.ok) {
        setErro(corpo?.error || "Não foi possível fechar as empresas selecionadas.");
        return;
      }
      setResumo({ fechadas: corpo.fechadas });
    } catch {
      setErro("Não foi possível fechar as empresas selecionadas.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="secondary" loading={pending} onClick={fechar} disabled={empresas.length === 0}>
        Fechar antecipadamente ({empresas.length})
      </Button>
      {erro && <Alert tone="danger">{erro}</Alert>}
      {resumo && <Alert tone="success">{resumo.fechadas} empresa(s) marcada(s) como fechada(s).</Alert>}
    </div>
  );
}
