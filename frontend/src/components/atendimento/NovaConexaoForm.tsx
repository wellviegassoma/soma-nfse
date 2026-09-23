"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";

export function NovaConexaoForm({
  departamentos,
}: {
  departamentos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [departamentoId, setDepartamentoId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar() {
    if (!nome.trim() || !departamentoId) {
      setErro("Informe nome e departamento padrão.");
      return;
    }
    setEnviando(true);
    setErro(null);
    const resposta = await fetch("/api/atendimento/conexoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: nome.trim(), departamento_padrao_id: departamentoId }),
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.error || "Falha ao criar conexão.");
      return;
    }
    setNome("");
    setDepartamentoId("");
    router.refresh();
  }

  return (
    <Card className="max-w-md p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Nova conexão</h2>
      <div className="space-y-3">
        <Input
          placeholder="Nome (ex.: SOMA Atendimento)"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <Select value={departamentoId} onChange={(e) => setDepartamentoId(e.target.value)}>
          <option value="">Departamento padrão...</option>
          {departamentos.map((dep) => (
            <option key={dep.id} value={dep.id}>
              {dep.nome}
            </option>
          ))}
        </Select>
        {erro && <Alert>{erro}</Alert>}
        <Button onClick={criar} loading={enviando}>
          Criar conexão
        </Button>
      </div>
      <p className="mt-3 text-xs text-foreground/50">
        Depois de criar, copie o ID e configure <code>ATENDIMENTO_CONEXAO_ID</code> no serviço
        whatsapp-connector para parear o QR Code.
      </p>
    </Card>
  );
}
