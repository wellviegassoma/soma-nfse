"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { salvarContribuinteAction } from "@/lib/actions/irpf";

export function EditarContribuinte(props: {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  responsavelId: string | null;
  observacoes: string | null;
  ativo: boolean;
  equipe: { id: string; nome: string }[];
}) {
  const [nome, setNome] = useState(props.nome);
  const [email, setEmail] = useState(props.email ?? "");
  const [telefone, setTelefone] = useState(props.telefone ?? "");
  const [resp, setResp] = useState(props.responsavelId ?? "");
  const [obs, setObs] = useState(props.observacoes ?? "");
  const [ativo, setAtivo] = useState(props.ativo);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = "text-xs font-medium text-foreground/55";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground/70">Cadastro</div>
      <label className="flex flex-col gap-1">
        <span className={label}>Nome</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-10 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>E-mail</span>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Telefone</span>
        <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="h-10 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Responsável padrão</span>
        <Select value={resp} onChange={(e) => setResp(e.target.value)} className="h-10 text-sm">
          <option value="">—</option>
          {props.equipe.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Observações</span>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={3}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-foreground/70">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-brand" />
        Ativo (entra na abertura do próximo exercício)
      </label>
      <div className="flex items-center gap-3">
        <Button
          loading={pending}
          onClick={() =>
            start(async () => {
              const r = await salvarContribuinteAction({
                id: props.id,
                nome,
                email,
                telefone,
                responsavelId: resp || null,
                observacoes: obs,
                ativo,
              });
              setMsg("error" in r ? r.error : "Salvo.");
            })
          }
        >
          Salvar
        </Button>
        {msg && <span className="text-xs text-foreground/60">{msg}</span>}
      </div>
    </Card>
  );
}
