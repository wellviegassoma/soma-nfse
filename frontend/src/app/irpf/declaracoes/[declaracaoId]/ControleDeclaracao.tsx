"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { atualizarDeclaracaoAction } from "@/lib/actions/irpf";
import {
  HONORARIO_LABEL,
  HONORARIO_STATUS,
  STATUS_DECLARACAO,
  STATUS_LABEL,
  type HonorarioStatus,
  type StatusDeclaracao,
} from "@/lib/irpf/comum";

export function ControleDeclaracao(props: {
  id: string;
  status: StatusDeclaracao;
  responsavelId: string | null;
  revisorId: string | null;
  honorarioValor: number | null;
  honorarioStatus: HonorarioStatus;
  observacoes: string | null;
  equipe: { id: string; nome: string }[];
}) {
  const [status, setStatus] = useState(props.status);
  const [resp, setResp] = useState(props.responsavelId ?? "");
  const [rev, setRev] = useState(props.revisorId ?? "");
  const [valor, setValor] = useState(props.honorarioValor === null ? "" : String(props.honorarioValor).replace(".", ","));
  const [hstatus, setHstatus] = useState(props.honorarioStatus);
  const [obs, setObs] = useState(props.observacoes ?? "");
  const [comentario, setComentario] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function salvar() {
    const v = valor.trim() ? Number(valor.replace(/\./g, "").replace(",", ".")) : null;
    if (v !== null && !Number.isFinite(v)) {
      setMsg("Valor do honorário inválido.");
      return;
    }
    start(async () => {
      const r = await atualizarDeclaracaoAction({
        id: props.id,
        status,
        responsavelId: resp || null,
        revisorId: rev || null,
        honorarioValor: v,
        honorarioStatus: hstatus,
        observacoes: obs,
        comentario,
      });
      if ("error" in r) setMsg(r.error);
      else {
        setMsg("Salvo.");
        setComentario("");
      }
    });
  }

  const label = "text-xs font-medium text-foreground/55";
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="text-sm font-semibold text-foreground/70">Controle</div>
      <label className="flex flex-col gap-1">
        <span className={label}>Situação</span>
        <Select value={status} onChange={(e) => setStatus(e.target.value as StatusDeclaracao)} className="h-10 text-sm">
          {STATUS_DECLARACAO.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Responsável</span>
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
          <span className={label}>Revisor</span>
          <Select value={rev} onChange={(e) => setRev(e.target.value)} className="h-10 text-sm">
            <option value="">—</option>
            {props.equipe.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className={label}>Honorário (R$)</span>
          <Input value={valor} onChange={(e) => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="h-10 text-sm" />
        </label>
        <label className="flex flex-col gap-1">
          <span className={label}>Situação do honorário</span>
          <Select value={hstatus} onChange={(e) => setHstatus(e.target.value as HonorarioStatus)} className="h-10 text-sm">
            {HONORARIO_STATUS.map((s) => (
              <option key={s} value={s}>
                {HONORARIO_LABEL[s]}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className={label}>Observações</span>
        <textarea
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          rows={2}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className={label}>Comentário no histórico (opcional)</span>
        <Input value={comentario} onChange={(e) => setComentario(e.target.value)} className="h-10 text-sm" />
      </label>
      <div className="flex items-center gap-3">
        <Button onClick={salvar} loading={pending}>
          Salvar
        </Button>
        {msg && <span className="text-xs text-foreground/60">{msg}</span>}
      </div>
    </Card>
  );
}
