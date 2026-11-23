"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { salvarContribuinteAction } from "@/lib/actions/irpf";

export function NovoContribuinte() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)}>
        Novo contribuinte
      </Button>
    );
  }
  return (
    <Card className="flex flex-wrap items-center gap-2 p-3">
      <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo" className="h-10 w-64" />
      <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="CPF" inputMode="numeric" className="h-10 w-40" />
      <Button
        loading={pending}
        onClick={() =>
          start(async () => {
            const r = await salvarContribuinteAction({ nome, cpf });
            if ("error" in r) setMsg(r.error);
            else router.push(`/irpf/contribuintes/${r.id}`);
          })
        }
      >
        Cadastrar
      </Button>
      <Button variant="ghost" onClick={() => setAberto(false)}>
        Cancelar
      </Button>
      {msg && <span className="text-xs text-danger">{msg}</span>}
    </Card>
  );
}
